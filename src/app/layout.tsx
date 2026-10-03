import type { Metadata } from "next";
import "./globals.css";
import { FleetProvider } from "@/lib/store";
import { ThemeProvider } from "@/lib/theme";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";
import Footer from "@/components/Footer";
import { AnalyticsBoot } from "@/components/AnalyticsBoot";

export const metadata: Metadata = {
  title: "Helios GPU Management System",
  description: "NVIDIA BCM-inspired multi-cluster GPU orchestration simulator — Slurm, Run:AI slicing, GPUStack serving, DCGM monitoring."
};

// Runs before paint so returning light-mode users never flash dark.
const THEME_BOOT = `try{if(localStorage.getItem('helios-theme')==='light'){document.documentElement.classList.add('light');document.documentElement.style.colorScheme='light'}}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
        <AnalyticsBoot />
        <ThemeProvider>
          <FleetProvider>
          <div className="flex min-h-screen bg-void text-zinc-200">
            <Sidebar />
            <div className="flex min-w-0 flex-1 flex-col">
              <Topbar />
              <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 pb-16 pt-6 sm:px-6">{children}</main>
              <Footer />
            </div>
          </div>
          </FleetProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
