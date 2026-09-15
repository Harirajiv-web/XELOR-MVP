import type { MetadataRoute } from "next";
import { PRODUCT_PROFILE } from "@spine/product/profile";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: `${PRODUCT_PROFILE.name} · ${PRODUCT_PROFILE.label}`,
    short_name: PRODUCT_PROFILE.name,
    description: PRODUCT_PROFILE.description,
    start_url: "/home",
    scope: "/",
    display: "standalone",
    background_color: PRODUCT_PROFILE.backgroundColor,
    theme_color: PRODUCT_PROFILE.themeColor,
    orientation: "any",
    icons: [
      { src: PRODUCT_PROFILE.icon, sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: PRODUCT_PROFILE.icon, sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
    shortcuts: [{ name: "Workspace", url: "/home" }],
  };
}
