const express = require("express");
const app = express();
const PORT = process.env.PORT || 3006;

const x = require("./x");
const gmail = require("./gmail");
const hotmail = require("./hotmail");
const instagram = require("./instagram");
const tiktok = require("./tiktok");
const discord = require("./discord");

app.use(express.json());

app.use("/x", x);

app.use("/gmail", gmail);

app.use("/hotmail", hotmail);

app.use("/instagram", instagram);

app.use("/tiktok", tiktok);

app.use("/discord", discord);

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
