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
            reason: ""
        });
        emit CertificateIssued(hash, msg.sender, expiresAt);
    }

    // ===================== MODULE C : vérification et révocation =====================
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

    function verifyCertificate(bytes32 hash)
        external
        view
        returns (Status status, address issuer, uint64 issuedAt, uint64 expiresAt, string memory reason)
    {
        Certificate storage c = certs[hash];
        if (c.issuedAt == 0) {
            return (Status.Unknown, address(0), 0, 0, "");
        }
        if (c.revoked) {
            status = Status.Revoked;
        } else if (block.timestamp > c.expiresAt) {
            status = Status.Expired;
        } else {
            status = Status.Valid;
        }
        return (status, c.issuer, c.issuedAt, c.expiresAt, c.reason);
    }
}
