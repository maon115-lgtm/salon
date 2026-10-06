import type { Metadata } from "next";
import "./globals.css";
import "./product.css";
import "./redesign.css";
export const metadata: Metadata = {title:"مواعيد | الصالونات وSpa",description:"الحجوزات والخدمات والفريق في مساحة واحدة",icons:{icon:"/favicon.svg"}};
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="ar" dir="rtl"><body>{children}</body></html>}

