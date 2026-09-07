import "./globals.css";

export const metadata = {
  title: "Production COGS",
  description: "Requester and factory COGS tracking for production requests",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
