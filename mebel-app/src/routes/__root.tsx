import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import appCss from "../styles.css?url";

const APP_NAME = "Рукша Мебель · Заказы";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: APP_NAME },
      { name: "theme-color", content: "#131211" },
      { name: "color-scheme", content: "dark" },
      { name: "application-name", content: APP_NAME },
      { name: "format-detection", content: "telephone=no" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
    scripts: [{ src: "https://telegram.org/js/telegram-web-app.js" }],
  }),
  component: RootDocument,
});

function RootDocument() {
  return (
    <html lang="ru" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <Outlet />
        <Scripts />
      </body>
    </html>
  );
}
