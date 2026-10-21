import "./globals.css";

export const metadata = {
  title: "NSB | Smart EUR/USD Analysis",
  description: "EUR/USD market structure analysis and paper trading workspace.",
};

export default function RootLayout({ children }) {
  return <html lang="en"><body>{children}</body></html>;
}
