import type { Metadata } from "next";
export const metadata: Metadata = {title:"Home air quality",description:"Your private air quality readings and history."};
export default function RootLayout({children}:{children:React.ReactNode}) { return <html lang="en"><body>{children}</body></html>; }
