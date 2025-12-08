import { Router } from "express"
import { getRandomAd, getAdsByPosition, trackAdImpression, trackAdClick } from "../handlers/ads"

const router = Router()

router.get("/random", getRandomAd)
router.get("", getAdsByPosition)
router.post("/:id/impression", trackAdImpression)
router.post("/:id/click", trackAdClick)

export default router
