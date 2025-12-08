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

    query += " ORDER BY created_at DESC"

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
