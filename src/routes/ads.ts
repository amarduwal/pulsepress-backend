import { Router } from "express"
import {
  getRandomAd,
  getAdsByPosition,
  trackAdImpression,
  trackAdClick,
  createAd,
  getAllAds,
  getAdStats,
  updateAd,
  deleteAd,
} from "../handlers/ads"

const router = Router()

router.get("/random", getRandomAd)
router.get("", getAdsByPosition)
router.post("", createAd)
router.get("/all", getAllAds)
router.get("/stats", getAdStats)
router.post("/:id/impression", trackAdImpression)
router.post("/:id/click", trackAdClick)
router.patch("/:id", updateAd)
router.delete("/:id", deleteAd)

export default router
