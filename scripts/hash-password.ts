import bcrypt from "bcryptjs";

const password = process.argv[2];
if (!password) {
  console.error("用法: npm run hash-password -- 你的密码");
  process.exit(1);
}

const hash = bcrypt.hashSync(password, 12);
console.log("\n把下面整行复制到 .env.local（已转义 $，可直接用）：\n");
console.log("APP_PASSWORD_HASH=" + hash.replace(/\$/g, "\\$"));
console.log("");
