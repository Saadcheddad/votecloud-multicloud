/**
 * ==============================================================================
 * Registre d'Audit Cryptographique Chaîné (SHA-256 Hash-Chain) - AWS EC2 IaaS #2
 * ==============================================================================
 * Chaque événement critique (VOTE_CAST, DOUBLE_VOTE_ATTEMPT, OUT_OF_WINDOW_ATTEMPT,
 * ELECTION_CREATED...) est scellé dans un bloc lié au hash du bloc précédent :
 *
 *   block_hash = SHA256(blockIndex | timestamp | eventType | sourceCloud |
 *                       electionId | actorHash | canonicalDetails | prevHash)
 *
 * Stocké en local (append-only) sur le volume EBS de l'instance AWS EC2, et
 * répliqué vers Supabase PostgreSQL pour permettre la détection de toute falsification.
 * ==============================================================================
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const GENESIS_HASH = '0'.repeat(64);

function canonicalize(obj) {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return `[${obj.map(canonicalize).join(',')}]`;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(obj[k])}`).join(',')}}`;
}

function computeBlockHash({
  blockIndex,
  timestamp,
  eventType,
  sourceCloud,
  electionId,
  actorHash,
  details,
  prevHash,
}) {
  const material = [
    String(blockIndex),
    String(timestamp),
    String(eventType),
    String(sourceCloud),
    String(electionId || ''),
    String(actorHash || ''),
    canonicalize(details || {}),
    String(prevHash),
  ].join('|');

  return crypto.createHash('sha256').update(material).digest('hex');
}

class AuditHashChain {
  constructor(ledgerFilePath, pool) {
    this.ledgerFilePath = path.resolve(ledgerFilePath);
    this.pool = pool;
    this.blocks = [];
    this.writeQueue = Promise.resolve();
    this.initialized = false;
  }

  async init() {
    if (this.initialized) return;
    const dir = path.dirname(this.ledgerFilePath);
    fs.mkdirSync(dir, { recursive: true });

    if (fs.existsSync(this.ledgerFilePath)) {
      const content = fs.readFileSync(this.ledgerFilePath, 'utf8').trim();
      if (content) {
        this.blocks = content
          .split('\n')
          .filter(Boolean)
          .map((line) => JSON.parse(line));
      }
    }

    // Si le registre local est vide mais que Supabase contient déjà des blocs, resynchroniser
    if (this.blocks.length === 0 && this.pool) {
      try {
        const res = await this.pool.query(
          `SELECT block_index, event_type, source_cloud, election_id, actor_hash, details, prev_hash, block_hash, created_at
           FROM audit_logs
           ORDER BY block_index ASC`
        );
        if (res.rows.length > 0) {
          this.blocks = res.rows.map((r) => ({
            blockIndex: r.block_index,
            timestamp: new Date(r.created_at).toISOString(),
            eventType: r.event_type,
            sourceCloud: r.source_cloud,
            electionId: r.election_id,
            actorHash: r.actor_hash,
            details: r.details || {},
            prevHash: r.prev_hash,
            blockHash: r.block_hash,
          }));
          const serialized = this.blocks.map((b) => JSON.stringify(b)).join('\n') + '\n';
          fs.writeFileSync(this.ledgerFilePath, serialized, 'utf8');
        }
      } catch (err) {
        console.warn('[HASH-CHAIN] Hydratation DB ignorée au démarrage :', err.message);
      }
    }

    this.initialized = true;
  }

  append({ eventType, sourceCloud, electionId = null, actorHash = null, details = {}, timestamp }) {
    // Sérialise les écritures concurrentes pour garantir l'unicité séquentielle de blockIndex
    const task = this.writeQueue.then(async () => {
      await this.init();
      const prevBlock = this.blocks[this.blocks.length - 1];
      const blockIndex = prevBlock ? prevBlock.blockIndex + 1 : 1;
      const prevHash = prevBlock ? prevBlock.blockHash : GENESIS_HASH;
      const ts = timestamp || new Date().toISOString();

      const block = {
        blockIndex,
        timestamp: ts,
        eventType,
        sourceCloud,
        electionId: electionId || null,
        actorHash: actorHash || null,
        details: details || {},
        prevHash,
      };
      block.blockHash = computeBlockHash(block);

      // 1. Persistance append-only sur le volume EBS local (AWS EC2 IaaS #2)
      fs.appendFileSync(this.ledgerFilePath, JSON.stringify(block) + '\n', 'utf8');
      this.blocks.push(block);

      // 2. Réplication dans Supabase PostgreSQL (PaaS #1)
      if (this.pool) {
        try {
          await this.pool.query(
            `INSERT INTO audit_logs (block_index, event_type, source_cloud, election_id, actor_hash, details, prev_hash, block_hash, created_at)
             VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9)
             ON CONFLICT (block_index) DO NOTHING`,
            [
              block.blockIndex,
              block.eventType,
              block.sourceCloud,
              block.electionId,
              block.actorHash,
              JSON.stringify(block.details),
              block.prevHash,
              block.blockHash,
              block.timestamp,
            ]
          );
        } catch (err) {
          console.error('[HASH-CHAIN] Erreur de réplication DB :', err.message);
        }
      }

      return block;
    });

    this.writeQueue = task.catch(() => {});
    return task;
  }

  verify() {
    let expectedPrevHash = GENESIS_HASH;
    for (let i = 0; i < this.blocks.length; i += 1) {
      const b = this.blocks[i];
      if (b.blockIndex !== i + 1) {
        return {
          valid: false,
          brokenAtBlock: b.blockIndex,
          reason: `Rupture de séquence au bloc #${b.blockIndex} (attendu #${i + 1})`,
          blocksVerified: i,
        };
      }
      if (b.prevHash !== expectedPrevHash) {
        return {
          valid: false,
          brokenAtBlock: b.blockIndex,
          reason: `Chaînage rompu au bloc #${b.blockIndex} (prev_hash incohérent)`,
          blocksVerified: i,
        };
      }
      const recomputed = computeBlockHash(b);
      if (recomputed !== b.blockHash) {
        return {
          valid: false,
          brokenAtBlock: b.blockIndex,
          reason: `Altération détectée au bloc #${b.blockIndex} (hash SHA-256 invalide)`,
          blocksVerified: i,
        };
      }
      expectedPrevHash = b.blockHash;
    }

    return {
      valid: true,
      blocksVerified: this.blocks.length,
      tipHash: this.blocks.length > 0 ? this.blocks[this.blocks.length - 1].blockHash : GENESIS_HASH,
      genesisHash: GENESIS_HASH,
    };
  }

  getRecent(limit = 50) {
    return this.blocks.slice(-limit).reverse();
  }

  countVotesForElection(electionId) {
    return this.blocks.filter(
      (b) => b.eventType === 'VOTE_CAST' && b.electionId === electionId
    ).length;
  }

  findReceiptBlock(receiptCode) {
    return this.blocks.find(
      (b) => b.eventType === 'VOTE_CAST' && b.details && b.details.receiptCode === receiptCode
    );
  }
}

module.exports = { AuditHashChain, computeBlockHash, GENESIS_HASH };
