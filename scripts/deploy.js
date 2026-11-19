const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

async function main() {
  const [admin, issuer] = await hre.ethers.getSigners();
  const reg = await hre.ethers.deployContract("CertificateRegistry");
  await reg.waitForDeployment();
  const address = await reg.getAddress();

  // Confort en local : le compte #1 devient émetteur autorisé
  await (await reg.addIssuer(issuer.address)).wait();

  const out = path.join(__dirname, "..", "frontend", "contract-config.js");
  fs.writeFileSync(out, `window.CONTRACT_ADDRESS = "${address}";\n`);

  console.log("CertificateRegistry :", address);
  console.log("Admin   (compte #0) :", admin.address);
  console.log("Émetteur (compte #1):", issuer.address);
  console.log("Adresse écrite dans  :", out);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
