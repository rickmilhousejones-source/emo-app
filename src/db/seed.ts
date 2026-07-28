import { ensureSeeded } from "./seed-data";

export { ensureSeeded, SEED_DIMENSIONS } from "./seed-data";

async function main() {
  await ensureSeeded();
  console.log("Seed OK：设置行 + 5 个预装维度");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
