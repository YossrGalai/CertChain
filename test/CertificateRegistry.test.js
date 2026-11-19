const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

const H = ethers.keccak256(ethers.toUtf8Bytes("diplome-1")); // hash de test
const Status = { Unknown: 0, Valid: 1, Revoked: 2, Expired: 3 };

async function deployFixture() {
  const [admin, issuer, other] = await ethers.getSigners();
  const reg = await ethers.deployContract("CertificateRegistry");
  const future = (await time.latest()) + 3600;
  return { reg, admin, issuer, other, future };
}

describe("CertificateRegistry", () => {
  describe("Module A - rôles", () => {
    it("OK : l'admin ajoute un émetteur", async () => {
      const { reg, issuer } = await loadFixture(deployFixture);
      await expect(reg.addIssuer(issuer.address)).to.emit(reg, "IssuerAdded").withArgs(issuer.address);
      expect(await reg.issuers(issuer.address)).to.equal(true);
    });
    it("REJETÉ : un non-admin ajoute un émetteur", async () => {
      const { reg, issuer, other } = await loadFixture(deployFixture);
      await expect(reg.connect(other).addIssuer(issuer.address)).to.be.revertedWith("Not admin");
    });
    it("OK : l'admin retire un émetteur", async () => {
      const { reg, issuer } = await loadFixture(deployFixture);
      await reg.addIssuer(issuer.address);
      await expect(reg.removeIssuer(issuer.address)).to.emit(reg, "IssuerRemoved");
    });
  });

  describe("Module B - émission", () => {
    it("OK : un émetteur émet un certificat", async () => {
      const { reg, issuer, future } = await loadFixture(deployFixture);
      await reg.addIssuer(issuer.address);
      await expect(reg.connect(issuer).issueCertificate(H, future)).to.emit(reg, "CertificateIssued");
    });
    it("REJETÉ : non-émetteur", async () => {
      const { reg, other, future } = await loadFixture(deployFixture);
      await expect(reg.connect(other).issueCertificate(H, future)).to.be.revertedWith("Not an authorized issuer");
    });
    it("REJETÉ : doublon", async () => {
      const { reg, issuer, future } = await loadFixture(deployFixture);
      await reg.addIssuer(issuer.address);
      await reg.connect(issuer).issueCertificate(H, future);
      await expect(reg.connect(issuer).issueCertificate(H, future)).to.be.revertedWith("Already registered");
    });
    it("REJETÉ : hash vide", async () => {
      const { reg, issuer, future } = await loadFixture(deployFixture);
      await reg.addIssuer(issuer.address);
      await expect(reg.connect(issuer).issueCertificate(ethers.ZeroHash, future)).to.be.revertedWith("Empty hash");
    });
  });

  describe("Module C - vérification et révocation", () => {
    it("OK : vérification valide", async () => {
      const { reg, issuer, future } = await loadFixture(deployFixture);
      await reg.addIssuer(issuer.address);
      await reg.connect(issuer).issueCertificate(H, future);
      expect((await reg.verifyCertificate(H)).status).to.equal(Status.Valid);
    });
    it("Inconnu : document jamais enregistré", async () => {
      const { reg } = await loadFixture(deployFixture);
      expect((await reg.verifyCertificate(H)).status).to.equal(Status.Unknown);
    });
    it("Expiré : après la date d'expiration", async () => {
      const { reg, issuer, future } = await loadFixture(deployFixture);
      await reg.addIssuer(issuer.address);
      await reg.connect(issuer).issueCertificate(H, future);
      await time.increaseTo(future + 1);
      expect((await reg.verifyCertificate(H)).status).to.equal(Status.Expired);
    });
    it("OK : l'émetteur d'origine révoque avec un motif", async () => {
      const { reg, issuer, future } = await loadFixture(deployFixture);
      await reg.addIssuer(issuer.address);
      await reg.connect(issuer).issueCertificate(H, future);
      await expect(reg.connect(issuer).revokeCertificate(H, "Erreur de saisie")).to.emit(reg, "CertificateRevoked");
      const v = await reg.verifyCertificate(H);
      expect(v.status).to.equal(Status.Revoked);
      expect(v.reason).to.equal("Erreur de saisie");
    });
    it("REJETÉ : révocation par un tiers", async () => {
      const { reg, issuer, other, future } = await loadFixture(deployFixture);
      await reg.addIssuer(issuer.address);
      await reg.connect(issuer).issueCertificate(H, future);
      await expect(reg.connect(other).revokeCertificate(H, "x")).to.be.revertedWith("Only original issuer");
    });
  });
});
