import type { Metadata, Viewport } from "next";
import { ThemeController } from "@/components/ThemeToggle";
import "./globals.css";
export const metadata: Metadata = {
  title: "Workspace AI",
  description: "Личное рабочее пространство",
  icons: {
    icon: "/icon.svg",
  },
};
export const viewport: Viewport = { colorScheme: "light dark" };
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var t='light';try{t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}catch(e){}try{var m=localStorage.getItem('restore-theme-mode');var l=localStorage.getItem('restore-theme')||localStorage.getItem('restore-auth-theme');if(m==='light'||m==='dark')t=m;else if(m!=='system'&&(l==='light'||l==='dark'))t=l}catch(e){}document.documentElement.dataset.theme=t;document.documentElement.dataset.authTheme=t})()`,
          }}
        />
        <ThemeController />
        {children}
      </body>
    </html>
  );
}
