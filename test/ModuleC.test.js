const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

const H1 = ethers.keccak256(ethers.toUtf8Bytes("diplome-1"));
const H2 = ethers.keccak256(ethers.toUtf8Bytes("diplome-1-corrige"));
const Status = { Unknown: 0, Valid: 1, Revoked: 2, Expired: 3 };

// Un émetteur (issuer) a déjà émis H1 ; "other" est aussi émetteur (pour tester "autre émetteur")
async function fixture() {
  const [admin, issuer, other, stranger] = await ethers.getSigners();
  const reg = await ethers.deployContract("CertificateRegistry");
  await reg.addIssuer(issuer.address);
  await reg.addIssuer(other.address);
  const t = await time.latest();
  const exp = t + 3600;
  const later = t + 7200;
  await reg.connect(issuer).issueCertificate(H1, exp);
  return { reg, admin, issuer, other, stranger, exp, later };
}

describe("Module C - revokeAndReplace", () => {
  it("OK : révoque l'ancien, enregistre le nouveau, liés entre eux", async () => {
    const { reg, issuer, later } = await loadFixture(fixture);
    await expect(reg.connect(issuer).revokeAndReplace(H1, H2, later, "Faute de frappe"))
      .to.emit(reg, "CertificateRevoked")
      .and.to.emit(reg, "CertificateIssued")
      .and.to.emit(reg, "CertificateReplaced").withArgs(H1, H2, issuer.address);

    const oldV = await reg.verifyCertificate(H1);
    expect(oldV.status).to.equal(Status.Revoked);
    expect(oldV.replacedBy).to.equal(H2);
    expect(oldV.reason).to.equal("Faute de frappe");

    const newV = await reg.verifyCertificate(H2);
    expect(newV.status).to.equal(Status.Valid);
    expect(newV.issuer).to.equal(issuer.address);
    expect(newV.replacedBy).to.equal(ethers.ZeroHash);
  });

  it("REJETÉ : un autre émetteur (pas l'émetteur d'origine)", async () => {
    const { reg, other, later } = await loadFixture(fixture);
    await expect(reg.connect(other).revokeAndReplace(H1, H2, later, "x"))
      .to.be.revertedWith("Only original issuer");
  });

  it("REJETÉ : un non-émetteur", async () => {
    const { reg, stranger, later } = await loadFixture(fixture);
    await expect(reg.connect(stranger).revokeAndReplace(H1, H2, later, "x"))
      .to.be.revertedWith("Not an authorized issuer");
  });

  it("REJETÉ : ancien certificat inconnu", async () => {
    const { reg, issuer, later } = await loadFixture(fixture);
    const unknown = ethers.keccak256(ethers.toUtf8Bytes("inconnu"));
    await expect(reg.connect(issuer).revokeAndReplace(unknown, H2, later, "x"))
      .to.be.revertedWith("Unknown certificate");
  });

  it("REJETÉ : ancien déjà révoqué", async () => {
    const { reg, issuer, later } = await loadFixture(fixture);
    await reg.connect(issuer).revokeCertificate(H1, "Erreur");
    await expect(reg.connect(issuer).revokeAndReplace(H1, H2, later, "x"))
      .to.be.revertedWith("Already revoked");
  });

  it("REJETÉ : motif vide", async () => {
    const { reg, issuer, later } = await loadFixture(fixture);
    await expect(reg.connect(issuer).revokeAndReplace(H1, H2, later, ""))
      .to.be.revertedWith("Reason required");
  });

  it("REJETÉ : nouveau hash vide", async () => {
    const { reg, issuer, later } = await loadFixture(fixture);
    await expect(reg.connect(issuer).revokeAndReplace(H1, ethers.ZeroHash, later, "x"))
      .to.be.revertedWith("Empty hash");
  });

  it("REJETÉ : nouveau hash déjà enregistré (y compris le même hash)", async () => {
    const { reg, issuer, later } = await loadFixture(fixture);
    await expect(reg.connect(issuer).revokeAndReplace(H1, H1, later, "x"))
      .to.be.revertedWith("Already registered");
  });

  it("REJETÉ : expiration du nouveau dans le passé", async () => {
    const { reg, issuer } = await loadFixture(fixture);
    const past = (await time.latest()) - 10;
    await expect(reg.connect(issuer).revokeAndReplace(H1, H2, past, "x"))
      .to.be.revertedWith("Expiration must be in the future");
  });

  it("REJETÉ : émetteur retiré par l'admin ne peut plus remplacer", async () => {
    const { reg, issuer, later } = await loadFixture(fixture);
    await reg.removeIssuer(issuer.address);
    await expect(reg.connect(issuer).revokeAndReplace(H1, H2, later, "x"))
      .to.be.revertedWith("Not an authorized issuer");
  });
});

describe("Module C - extendExpiration", () => {
  it("OK : l'émetteur d'origine prolonge", async () => {
    const { reg, issuer, exp, later } = await loadFixture(fixture);
    await expect(reg.connect(issuer).extendExpiration(H1, later))
      .to.emit(reg, "CertificateExtended").withArgs(H1, issuer.address, exp, later);
    expect((await reg.verifyCertificate(H1)).expiresAt).to.equal(later);
  });

  it("OK : prolongation d'un certificat déjà expiré le remet en Valide", async () => {
    const { reg, issuer, exp } = await loadFixture(fixture);
    await time.increaseTo(exp + 10);
    expect((await reg.verifyCertificate(H1)).status).to.equal(Status.Expired);
    const newExp = (await time.latest()) + 3600;
    await reg.connect(issuer).extendExpiration(H1, newExp);
    expect((await reg.verifyCertificate(H1)).status).to.equal(Status.Valid);
  });

  it("REJETÉ : un autre que l'émetteur d'origine", async () => {
    const { reg, other, later } = await loadFixture(fixture);
    await expect(reg.connect(other).extendExpiration(H1, later))
      .to.be.revertedWith("Only original issuer");
  });

  it("REJETÉ : certificat révoqué", async () => {
    const { reg, issuer, later } = await loadFixture(fixture);
    await reg.connect(issuer).revokeCertificate(H1, "Erreur");
    await expect(reg.connect(issuer).extendExpiration(H1, later))
      .to.be.revertedWith("Already revoked");
  });

  it("REJETÉ : raccourcir ou garder la même date", async () => {
    const { reg, issuer, exp } = await loadFixture(fixture);
    await expect(reg.connect(issuer).extendExpiration(H1, exp - 100))
      .to.be.revertedWith("Must extend, not shorten");
    await expect(reg.connect(issuer).extendExpiration(H1, exp))
      .to.be.revertedWith("Must extend, not shorten");
  });

  it("REJETÉ : certificat inconnu", async () => {
    const { reg, issuer, later } = await loadFixture(fixture);
    const unknown = ethers.keccak256(ethers.toUtf8Bytes("inconnu"));
    await expect(reg.connect(issuer).extendExpiration(unknown, later))
      .to.be.revertedWith("Unknown certificate");
  });
});
