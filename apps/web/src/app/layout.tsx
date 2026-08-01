import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Providers } from "./providers";
import { themeBootScript } from "@spine/theme/theme";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "XELOR",
    template: "%s · XELOR",
  },
  description: "XELOR manufacturing intelligence by AIKYANTRA.",
};

export default function RootLayout({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Runs before the body renders, so somebody on dark never sees a white flash on the
            way in. It has to be inline and it has to be here — a script loaded from a file
            arrives after the first paint, which is one frame too late and exactly the frame
            that matters. `dangerouslySetInnerHTML` is the only way React will emit an inline
            script; the content is a constant in our own source, not anything from a user. */}
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
