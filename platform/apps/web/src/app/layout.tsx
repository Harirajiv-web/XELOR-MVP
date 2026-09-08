import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { PRODUCT_PROFILE } from "@spine/product/profile";
import { InstallApp } from "@spine/product/install-app";
import { Providers } from "./providers";
import { themeBootScript } from "@spine/theme/theme";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: PRODUCT_PROFILE.name,
    template: `%s · ${PRODUCT_PROFILE.name}`,
  },
  description: PRODUCT_PROFILE.description,
  applicationName: PRODUCT_PROFILE.name,
  appleWebApp: { capable: true, statusBarStyle: "default", title: PRODUCT_PROFILE.name },
  icons: { icon: "/icons/app.svg", apple: "/icons/app.svg" },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#12302e", viewportFit: "cover" };

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
        <Providers>{children}<InstallApp /></Providers>
      </body>
    </html>
  );
}
