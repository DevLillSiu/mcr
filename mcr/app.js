const express = require("express");
const app = express();
const PORT = process.env.PORT || 3006;
const x = require("./x");
const acc_x = require("./acc_x");
const api_x = require("./api_x");
const gmail = require("./gmail");
const acc_gmail = require("./acc_gmail");
const api_gmail = require("./api_gmail");
const hotmail = require("./hotmail");

app.use(express.json());

app.use("/x", x);

app.use("/acc_x", acc_x);

app.use("/api_x", api_x);

app.use("/gmail", gmail);

app.use("/acc_gmail", acc_gmail);

app.use("/api_gmail", api_gmail);

app.use("/hotmail", hotmail);

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
