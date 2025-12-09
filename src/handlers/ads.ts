import type { Request, Response } from "express"
import { pool } from "../db/client"

function transformAdvertisementFromDb(row: any) {
  return {
    id: row.id,
    adType: row.ad_type,
    adName: row.ad_name,
    adCode: row.ad_code,
    position: row.position,
    isActive: row.is_active,
    impressionsCount: row.impressions_count,
    clicksCount: row.clicks_count,
    ctr: row.ctr,
    mediaType: row.media_type,
    mediaUrl: row.media_url,
    durationSeconds: row.duration_seconds,
    targetUrl: row.target_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function getRandomAd(_req: Request, res: Response) {
  try {
    const result = await pool.query("SELECT * FROM advertisements WHERE is_active = TRUE ORDER BY RANDOM() LIMIT 1")

    if (result.rows.length === 0) {
      return res.json({ ok: true, data: { ad: null } })
    }

    const ad = transformAdvertisementFromDb(result.rows[0])
    return res.json({ ok: true, data: { ad } })
  } catch (error) {
    console.error("Failed to fetch random ad:", error)
    return res.status(500).json({ ok: false, error: "Failed to fetch ad" })
  }
}

export async function getAdsByPosition(req: Request, res: Response) {
  try {
    const { position } = req.query

    let query = "SELECT * FROM advertisements WHERE is_active = TRUE"
    const params: any[] = []

    if (position) {
      query += " AND position = $1"
      params.push(position)
    }

    query += " ORDER BY RANDOM() LIMIT 5"

    const result = await pool.query(query, params)
    const ads = result.rows.map(transformAdvertisementFromDb)

    return res.json({ ok: true, data: { ads } })
  } catch (error) {
    console.error("Failed to fetch ads:", error)
    return res.status(500).json({ ok: false, error: "Failed to fetch ads" })
  }
}

export async function trackAdImpression(req: Request, res: Response) {
  try {
    const { id } = req.params

    await pool.query("UPDATE advertisements SET impressions_count = impressions_count + 1 WHERE id = $1", [id])

    return res.json({ ok: true })
  } catch (error) {
    console.error("Failed to track ad impression:", error)
    return res.status(500).json({ ok: false, error: "Failed to track impression" })
  }
}

export async function trackAdClick(req: Request, res: Response) {
  try {
    const { id } = req.params

    await pool.query("UPDATE advertisements SET clicks_count = clicks_count + 1 WHERE id = $1", [id])

    return res.json({ ok: true })
  } catch (error) {
    console.error("Failed to track ad click:", error)
    return res.status(500).json({ ok: false, error: "Failed to track click" })
  }
}

export async function createAd(req: Request, res: Response) {
  try {
    const { adName, adType, position, adCode, mediaType, mediaUrl, targetUrl, durationSeconds } = req.body

    if (!adName || !adType || !position) {
      return res.status(400).json({ ok: false, error: "Missing required fields" })
    }

    const result = await pool.query(
      `INSERT INTO advertisements (ad_name, ad_type, position, ad_code, media_type, media_url, target_url, duration_seconds, is_active, impressions_count, clicks_count, ctr, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE, 0, 0, 0, NOW(), NOW())
       RETURNING *`,
      [
        adName,
        adType,
        position,
        adCode || null,
        mediaType || null,
        mediaUrl || null,
        targetUrl || null,
        durationSeconds || 0,
      ],
    )

    const ad = transformAdvertisementFromDb(result.rows[0])
    return res.json({ ok: true, data: { ad } })
  } catch (error) {
    console.error("Failed to create ad:", error)
    return res.status(500).json({ ok: false, error: "Failed to create ad" })
  }
}

export async function updateAd(req: Request, res: Response) {
  try {
    const { id } = req.params
    const { adName, adType, position, adCode, mediaType, mediaUrl, targetUrl, durationSeconds, isActive } = req.body

    const result = await pool.query(
      `UPDATE advertisements
       SET ad_name = COALESCE($1, ad_name),
           ad_type = COALESCE($2, ad_type),
           position = COALESCE($3, position),
           ad_code = COALESCE($4, ad_code),
           media_type = COALESCE($5, media_type),
           media_url = COALESCE($6, media_url),
           target_url = COALESCE($7, target_url),
           duration_seconds = COALESCE($8, duration_seconds),
           is_active = COALESCE($9, is_active),
           updated_at = NOW()
       WHERE id = $10
       RETURNING *`,
      [adName, adType, position, adCode, mediaType, mediaUrl, targetUrl, durationSeconds, isActive, id],
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ ok: false, error: "Ad not found" })
    }

    const ad = transformAdvertisementFromDb(result.rows[0])
    return res.json({ ok: true, data: { ad } })
  } catch (error) {
    console.error("Failed to update ad:", error)
    return res.status(500).json({ ok: false, error: "Failed to update ad" })
  }
}

export async function deleteAd(req: Request, res: Response) {
  try {
    const { id } = req.params

    const result = await pool.query("DELETE FROM advertisements WHERE id = $1 RETURNING id", [id])

    if (result.rows.length === 0) {
      return res.status(404).json({ ok: false, error: "Ad not found" })
    }

    return res.json({ ok: true, data: { id: result.rows[0].id } })
  } catch (error) {
    console.error("Failed to delete ad:", error)
    return res.status(500).json({ ok: false, error: "Failed to delete ad" })
  }
}

export async function getAllAds(_req: Request, res: Response) {
  try {
    const result = await pool.query(`SELECT * FROM advertisements ORDER BY created_at DESC`)

    const ads = result.rows.map(transformAdvertisementFromDb)
    return res.json({ ok: true, data: { ads } })
  } catch (error) {
    console.error("Failed to fetch ads:", error)
    return res.status(500).json({ ok: false, error: "Failed to fetch ads" })
  }
}

export async function getAdStats(_req: Request, res: Response) {
  try {
    const result = await pool.query(`
      SELECT
        COUNT(*) as totalAds,
        SUM(CAST(impressions_count AS BIGINT)) as totalImpressions,
        SUM(CAST(clicks_count AS BIGINT)) as totalClicks,
        CASE
          WHEN SUM(CAST(impressions_count AS BIGINT)) > 0
          THEN ROUND((SUM(CAST(clicks_count AS BIGINT))::NUMERIC / SUM(CAST(impressions_count AS BIGINT))::NUMERIC) * 100, 2)
          ELSE 0
        END as avgCTR
      FROM advertisements
      WHERE is_active = TRUE
    `)

    const row = result.rows[0];
    const stats = {
      totalAds: Number.parseInt(row.totalads || "0"),
      totalImpressions: Number.parseInt(row.totalimpressions || "0"),
      totalClicks: Number.parseInt(row.totalclicks || "0"),
      avgCTR: parseFloat(row.avgctr || "0"),
    }

    return res.json({ ok: true, data: { stats } })
  } catch (error) {
    console.error("Failed to fetch ad stats:", error)
    return res.status(500).json({ ok: false, error: "Failed to fetch stats" })
  }
}
