import { Injectable } from "@nestjs/common";
import { eq, sql } from "drizzle-orm";
import { withTenant, schema } from "@ind-core/db";
import { Errors, currentTenant } from "@ind-core/platform";

const { cspKbArticle } = schema;

export interface KbHit {
  articleCode: string;
  title: string;
  category: string | null;
  visibility: string;
  rank: number;
  helpfulPct: number | null;
  snippet: string;
}

/**
 * THE KNOWLEDGE BASE.
 *
 * The search is full-text over a GENERATED tsvector, so an edited article cannot fall out
 * of the index — an index maintained by application code is stale exactly when it matters.
 * Trigram similarity on the title is unioned in, because a shop-floor engineer searching
 * "beering" should still find the bearing article.
 *
 * Visibility is enforced by RLS, not by the WHERE clause below. The `status = published`
 * filter here is a nicety for the desk; for a portal session the restrictive policy on
 * this table has already made an internal article unselectable, so a bug in this method
 * cannot leak the complaint→NCR hand-off SOP to a customer.
 */
@Injectable()
export class KbService {
  async search(q: string, limit = 5): Promise<KbHit[]> {
    const query = q.trim();
    if (!query) return [];
    return withTenant(async (tx) => {
      const rows = await tx.execute<{
        article_code: string;
        title: string;
        category: string | null;
        visibility: string;
        body_md: string;
        helpful_count: number;
        not_helpful_count: number;
        rank: number;
      }>(sql`
        select article_code, title, category, visibility, body_md, helpful_count, not_helpful_count,
               greatest(
                 ts_rank(search_tsv, websearch_to_tsquery('english', ${query})),
                 similarity(title, ${query})
               ) as rank
          from csp_kb_article
         where status = 'published'
           and (search_tsv @@ websearch_to_tsquery('english', ${query})
                or similarity(title, ${query}) > 0.2)
         order by rank desc
         limit ${limit}
      `);
      return rows.rows.map((r) => {
        const votes = r.helpful_count + r.not_helpful_count;
        return {
          articleCode: r.article_code,
          title: r.title,
          category: r.category,
          visibility: r.visibility,
          rank: Math.round(Number(r.rank) * 1000) / 1000,
          helpfulPct: votes === 0 ? null : Math.round((r.helpful_count / votes) * 100),
          snippet: r.body_md.replace(/[#*`\n]+/g, " ").trim().slice(0, 180),
        };
      });
    });
  }

  /** Suggested reading offered at submit time. Deliberately capped low: a wall of maybe-
   *  relevant articles is how a customer learns to skip the deflection step entirely. */
  async suggestFor(subject: string, description: string): Promise<KbHit[]> {
    const hits = await this.search(`${subject} ${description}`.slice(0, 200), 3);
    return hits.filter((h) => h.rank > 0.05);
  }

  async read(articleCode: string): Promise<Record<string, unknown>> {
    const { actorId } = currentTenant();
    return withTenant(async (tx) => {
      const [a] = await tx.select().from(cspKbArticle).where(eq(cspKbArticle.articleCode, articleCode)).limit(1);
      if (!a) throw Errors.notFound(`article ${articleCode}`);
      await tx
        .update(cspKbArticle)
        .set({ viewCount: a.viewCount + 1, updatedBy: actorId, updatedAt: new Date() })
        .where(eq(cspKbArticle.id, a.id));
      const votes = a.helpfulCount + a.notHelpfulCount;
      return {
        articleCode: a.articleCode,
        title: a.title,
        body: a.bodyMd,
        category: a.category,
        version: a.version,
        helpfulPct: votes === 0 ? null : Math.round((a.helpfulCount / votes) * 100),
        views: a.viewCount + 1,
      };
    });
  }

  /** A helpful/not-helpful vote. The counts are the only signal the KB has about whether
   *  an article actually deflects anything, so they are recorded even when the vote is no. */
  async vote(articleCode: string, helpful: boolean): Promise<{ articleCode: string; helpfulPct: number }> {
    const { actorId } = currentTenant();
    return withTenant(async (tx) => {
      const [a] = await tx.select().from(cspKbArticle).where(eq(cspKbArticle.articleCode, articleCode)).limit(1);
      if (!a) throw Errors.notFound(`article ${articleCode}`);
      const helpfulCount = a.helpfulCount + (helpful ? 1 : 0);
      const notHelpfulCount = a.notHelpfulCount + (helpful ? 0 : 1);
      await tx
        .update(cspKbArticle)
        .set({ helpfulCount, notHelpfulCount, updatedBy: actorId, updatedAt: new Date() })
        .where(eq(cspKbArticle.id, a.id));
      const votes = helpfulCount + notHelpfulCount;
      return { articleCode, helpfulPct: Math.round((helpfulCount / votes) * 100) };
    });
  }
}
