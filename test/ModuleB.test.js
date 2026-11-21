const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

const h = (s) => ethers.keccak256(ethers.toUtf8Bytes(s));
const H1 = h("diplome-B1");
const H2 = h("diplome-B2");
const H3 = h("diplome-B3");
const Status = { Unknown: 0, Valid: 1, Revoked: 2, Expired: 3 };
const YEAR = 365 * 24 * 3600;

async function fixture() {
  const [admin, issuer, other] = await ethers.getSigners();
  const reg = await ethers.deployContract("CertificateRegistry");
  await reg.addIssuer(issuer.address);
  const t = await time.latest();
  return { reg, admin, issuer, other, t, future: t + 3600 };
}

describe("Module B - émission (détaillé)", () => {
  describe("Émission simple", () => {
    it("OK : stocke l'émetteur, les dates et le statut Valide", async () => {
      const { reg, issuer, future } = await loadFixture(fixture);
      await expect(reg.connect(issuer).issueCertificate(H1, future))
        .to.emit(reg, "CertificateIssued").withArgs(H1, issuer.address, future);
      const v = await reg.verifyCertificate(H1);
      expect(v.status).to.equal(Status.Valid);
      expect(v.issuer).to.equal(issuer.address);
      expect(v.expiresAt).to.equal(future);
      expect(v.issuedAt).to.be.gt(0);
      expect(v.replacedBy).to.equal(ethers.ZeroHash);
    });

    it("OK : émettre un hash n'affecte pas les autres (reste Inconnu)", async () => {
      const { reg, issuer, future } = await loadFixture(fixture);
      await reg.connect(issuer).issueCertificate(H1, future);
      expect((await reg.verifyCertificate(H2)).status).to.equal(Status.Unknown);
    });

    it("REJETÉ : l'admin n'est pas émetteur (séparation des rôles)", async () => {
      const { reg, future } = await loadFixture(fixture);
      await expect(reg.issueCertificate(H1, future)).to.be.revertedWith("Not an authorized issuer");
    });

    it("REJETÉ : émetteur retiré par l'admin", async () => {
      const { reg, issuer, future } = await loadFixture(fixture);
      await reg.removeIssuer(issuer.address);
      await expect(reg.connect(issuer).issueCertificate(H1, future)).to.be.revertedWith("Not an authorized issuer");
    });

    it("REJETÉ : expiration dans le passé", async () => {
      const { reg, issuer, t } = await loadFixture(fixture);
      await expect(reg.connect(issuer).issueCertificate(H1, t - 10)).to.be.revertedWith("Expiration must be in the future");
    });

    it("REJETÉ : expiration trop lointaine (> 20 ans)", async () => {
      const { reg, issuer, t } = await loadFixture(fixture);
      await expect(reg.connect(issuer).issueCertificate(H1, t + 21 * YEAR)).to.be.revertedWith("Expiration too far");
    });

    it("OK : expiration à 19 ans acceptée", async () => {
      const { reg, issuer, t } = await loadFixture(fixture);
      await expect(reg.connect(issuer).issueCertificate(H1, t + 19 * YEAR)).to.emit(reg, "CertificateIssued");
    });

    it("REJETÉ : timestamp en millisecondes (erreur classique JS)", async () => {
      const { reg, issuer, future } = await loadFixture(fixture);
      await expect(reg.connect(issuer).issueCertificate(H1, future * 1000)).to.be.revertedWith("Expiration too far");
    });
  });

  describe("Expiration", () => {
    it("Expiré : émis à +1 h, il devient Expiré une fois l'heure passée", async () => {
      const { reg, issuer, future } = await loadFixture(fixture);
      await reg.connect(issuer).issueCertificate(H1, future);
      expect((await reg.verifyCertificate(H1)).status).to.equal(Status.Valid);
      await time.increaseTo(future + 1);
      expect((await reg.verifyCertificate(H1)).status).to.equal(Status.Expired);
    });

    it("REJETÉ : un certificat expiré ne peut pas être réémis (hash déjà pris)", async () => {
      const { reg, issuer, future } = await loadFixture(fixture);
      await reg.connect(issuer).issueCertificate(H1, future);
      await time.increaseTo(future + 1);
      const neuf = (await time.latest()) + 3600;
      await expect(reg.connect(issuer).issueCertificate(H1, neuf)).to.be.revertedWith("Already registered");
    });
  });

  describe("Émission par lot", () => {
    it("OK : un lot de 3 certificats en une transaction", async () => {
      const { reg, issuer, future } = await loadFixture(fixture);
      const hashes = [H1, H2, H3];
      const tx = await reg.connect(issuer).issueCertificates(hashes, future);
      const rc = await tx.wait();
      for (const x of hashes) expect((await reg.verifyCertificate(x)).status).to.equal(Status.Valid);
      console.log("      gas pour 3 certificats :", rc.gasUsed.toString());
    });

    it("OK : un lot de 50 (limite) tient dans un bloc", async () => {
      const { reg, issuer, future } = await loadFixture(fixture);
      const hashes = Array.from({ length: 50 }, (_, i) => h("promo-" + i));
      const rc = await (await reg.connect(issuer).issueCertificates(hashes, future)).wait();
      console.log("      gas pour 50 certificats :", rc.gasUsed.toString());
    });

    it("REJETÉ : lot vide", async () => {
      const { reg, issuer, future } = await loadFixture(fixture);
      await expect(reg.connect(issuer).issueCertificates([], future)).to.be.revertedWith("Empty batch");
    });

    it("REJETÉ : lot trop grand (51)", async () => {
      const { reg, issuer, future } = await loadFixture(fixture);
      const hashes = Array.from({ length: 51 }, (_, i) => h("x" + i));
      await expect(reg.connect(issuer).issueCertificates(hashes, future)).to.be.revertedWith("Batch too large");
    });

    it("REJETÉ : un doublon dans le lot annule tout le lot (atomicité)", async () => {
      const { reg, issuer, future } = await loadFixture(fixture);
      await expect(reg.connect(issuer).issueCertificates([H1, H2, H1], future)).to.be.revertedWith("Already registered");
      expect((await reg.verifyCertificate(H1)).status).to.equal(Status.Unknown);
      expect((await reg.verifyCertificate(H2)).status).to.equal(Status.Unknown);
    });

    it("REJETÉ : un hash déjà enregistré avant le lot", async () => {
      const { reg, issuer, future } = await loadFixture(fixture);
      await reg.connect(issuer).issueCertificate(H2, future);
      await expect(reg.connect(issuer).issueCertificates([H1, H2], future)).to.be.revertedWith("Already registered");
    });

    it("REJETÉ : lot par un non-émetteur", async () => {
      const { reg, other, future } = await loadFixture(fixture);
      await expect(reg.connect(other).issueCertificates([H1], future)).to.be.revertedWith("Not an authorized issuer");
    });
  });
});