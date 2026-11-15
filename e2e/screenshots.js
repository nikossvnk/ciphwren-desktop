// Takes the screenshots of the README (../.github/screenshots/), of the web build with the sample
// data of seed.js. Run it with an account that seed.js filled once:
//
//   E2E_USER=alex E2E_PASSWORD=some-password node seed.js
//   E2E_USER=alex E2E_PASSWORD=some-password node screenshots.js
const path = require("path");
const { config, launch, session } = require("./lib");

const out = path.join(__dirname, "..", ".github", "screenshots");
// The server that the app is told and shows. Its requests are answered by the test server.
const shownServer = "https://etebase.example.com";

(async () => {
  const browser = await launch();
  // Twice the pixels, so that the text stays sharp when the README shows them smaller
  const A = await session(browser, "A", { width: 1280, height: 800 }, { deviceScaleFactor: 2, colorScheme: "light" });
  const { p, wait } = A;
  await A.ctx.route(shownServer + "/**", async (route) => {
    const request = route.request();
    const response = await route.fetch({
      url: config.serverUrl + request.url().slice(shownServer.length),
      // (the login is signed for the host it's sent to, which the server checks)
      headers: { ...request.headers(), host: new URL(shownServer).host },
    });
    await route.fulfill({ response });
  });
  const shot = async (name) => { await wait(800); await p.screenshot({ path: path.join(out, name + ".png") }); console.log(name); };
  const go = async (to) => { await p.goto(config.appUrl + to); await wait(4000); };
  const click = async (text) => { await p.getByText(text, { exact: true }).locator("visible=true").first().click(); await wait(1500); };

  await p.goto(config.appUrl + "/"); await wait(4000);
  await A.vis('[aria-label="Change the server"]').click(); await wait(500);
  await A.vis('input[aria-label="Username"]').fill(config.username);
  await A.vis('input[aria-label="Password"]').fill(config.password);
  await A.vis('input[aria-label="Server URL"]').fill(shownServer);
  await A.btn(/^log in$/i).click(); await wait(9000);

  await go("/calendar");
  await shot("calendar");
  await go("/tasks");
  await click("Renew passport");
  await shot("tasks");
  await go("/");
  await A.open("Meeting notes");
  await shot("notes");
  await go("/bookmarks");
  await shot("bookmarks");
  await go("/contacts");
  await click("Maria Papadopoulou");
  await shot("contacts");

  // The dark theme (the app follows the system's)
  await p.emulateMedia({ colorScheme: "dark" });
  await go("/");
  await A.open("Welcome");
  await shot("dark-mode");

  await browser.close();
  process.exit(0);
})().catch((e) => {
  console.log("FAILED", e);
  process.exit(1);
});
