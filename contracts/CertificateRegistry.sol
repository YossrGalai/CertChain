// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title CertificateRegistry - certification de diplômes (hash uniquement on-chain)
contract CertificateRegistry {
    // ===================== MODULE C : types =====================
    enum Status { Unknown, Valid, Revoked, Expired }

    struct Certificate {
        address issuer;
        uint64 issuedAt;
        uint64 expiresAt;
        bool revoked;
        string reason;
        bytes32 replacedBy; // MODULE C : hash du certificat qui remplace celui-ci (0 = aucun)
    }

    // ===================== État =====================
    address public admin;
    mapping(address => bool) public issuers;
    mapping(bytes32 => Certificate) private certs;

    // ===================== Événements =====================
    event IssuerAdded(address indexed issuer);
    event IssuerRemoved(address indexed issuer);
    event CertificateIssued(bytes32 indexed hash, address indexed issuer, uint64 expiresAt);
    event CertificateRevoked(bytes32 indexed hash, address indexed issuer, string reason);
    // MODULE C
    event CertificateReplaced(bytes32 indexed oldHash, bytes32 indexed newHash, address indexed issuer);
    event CertificateExtended(bytes32 indexed hash, address indexed issuer, uint64 oldExpiresAt, uint64 newExpiresAt);

    // ===================== MODULE A : rôles et accès =====================
    modifier onlyAdmin() {
        require(msg.sender == admin, "Not admin");
        _;
    }

    modifier onlyIssuer() {
        require(issuers[msg.sender], "Not an authorized issuer");
        _;
    }

    constructor() {
        admin = msg.sender;
    }

    function addIssuer(address a) external onlyAdmin {
        require(a != address(0), "Zero address");
        require(!issuers[a], "Already issuer");
        issuers[a] = true;
        emit IssuerAdded(a);
    }

    function removeIssuer(address a) external onlyAdmin {
        require(issuers[a], "Not an issuer");
        issuers[a] = false;
        emit IssuerRemoved(a);
    }

    // ===================== MODULE B : émission =====================
    function issueCertificate(bytes32 hash, uint64 expiresAt) external onlyIssuer {
        require(hash != bytes32(0), "Empty hash");
        require(certs[hash].issuedAt == 0, "Already registered");
        require(expiresAt > block.timestamp, "Expiration must be in the future");

        certs[hash] = Certificate({
            issuer: msg.sender,
            issuedAt: uint64(block.timestamp),
            expiresAt: expiresAt,
            revoked: false,
            reason: "",
            replacedBy: bytes32(0)
        });
        emit CertificateIssued(hash, msg.sender, expiresAt);
    }

    // ===================== MODULE C : vérification, révocation, remplacement, prolongation =====================

    /// Révocation simple (inchangée) : seul l'émetteur d'origine, avec un motif.
    function revokeCertificate(bytes32 hash, string calldata reason) external {
        Certificate storage c = certs[hash];
        require(c.issuedAt != 0, "Unknown certificate");
        require(c.issuer == msg.sender, "Only original issuer");
        require(!c.revoked, "Already revoked");
        require(bytes(reason).length > 0, "Reason required");

        c.revoked = true;
        c.reason = reason;
        emit CertificateRevoked(hash, msg.sender, reason);
    }

    /// Révoque un certificat erroné ET enregistre sa version corrigée, en une seule transaction.
    /// L'émetteur doit être toujours autorisé (il émet un nouveau certificat).
    function revokeAndReplace(
        bytes32 oldHash,
        bytes32 newHash,
        uint64 newExpiresAt,
        string calldata reason
    ) external onlyIssuer {
        Certificate storage old = certs[oldHash];
        require(old.issuedAt != 0, "Unknown certificate");
        require(old.issuer == msg.sender, "Only original issuer");
        require(!old.revoked, "Already revoked");
        require(bytes(reason).length > 0, "Reason required");
        require(newHash != bytes32(0), "Empty hash");
        require(certs[newHash].issuedAt == 0, "Already registered");
        require(newExpiresAt > block.timestamp, "Expiration must be in the future");

        // 1) révocation de l'ancien, lié au nouveau
        old.revoked = true;
        old.reason = reason;
        old.replacedBy = newHash;

        // 2) enregistrement du nouveau, même émetteur
        certs[newHash] = Certificate({
            issuer: msg.sender,
            issuedAt: uint64(block.timestamp),
            expiresAt: newExpiresAt,
            revoked: false,
            reason: "",
            replacedBy: bytes32(0)
        });

        emit CertificateRevoked(oldHash, msg.sender, reason);
        emit CertificateIssued(newHash, msg.sender, newExpiresAt);
        emit CertificateReplaced(oldHash, newHash, msg.sender);
    }

    /// Prolonge la validité : seul l'émetteur d'origine, jamais sur un certificat révoqué,
    /// et uniquement vers une date plus lointaine (on ne raccourcit pas).
    function extendExpiration(bytes32 hash, uint64 newExpiresAt) external {
        Certificate storage c = certs[hash];
        require(c.issuedAt != 0, "Unknown certificate");
        require(c.issuer == msg.sender, "Only original issuer");
        require(!c.revoked, "Already revoked");
        require(newExpiresAt > c.expiresAt, "Must extend, not shorten");
        require(newExpiresAt > block.timestamp, "Expiration must be in the future");

        uint64 oldExpiresAt = c.expiresAt;
        c.expiresAt = newExpiresAt;
        emit CertificateExtended(hash, msg.sender, oldExpiresAt, newExpiresAt);
    }

    /// Vérification publique (lecture seule, gratuite).
    function verifyCertificate(bytes32 hash)
        external
        view
        returns (
            Status status,
            address issuer,
            uint64 issuedAt,
            uint64 expiresAt,
            string memory reason,
            bytes32 replacedBy
        )
    {
        Certificate storage c = certs[hash];
        if (c.issuedAt == 0) {
            return (Status.Unknown, address(0), 0, 0, "", bytes32(0));
        }
        if (c.revoked) {
            status = Status.Revoked;
        } else if (block.timestamp > c.expiresAt) {
            status = Status.Expired;
        } else {
            status = Status.Valid;
        }
        return (status, c.issuer, c.issuedAt, c.expiresAt, c.reason, c.replacedBy);
    }
}
