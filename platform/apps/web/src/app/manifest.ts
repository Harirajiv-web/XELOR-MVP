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
    background_color: "#f6f8f7",
    theme_color: "#12302e",
    orientation: "any",
    icons: [
      { src: "/icons/app.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icons/app-maskable.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
    shortcuts: [{ name: "Workspace", url: "/home" }],
  };
}
