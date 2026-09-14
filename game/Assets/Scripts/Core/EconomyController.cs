// EconomyController.cs — 果实经济，购买/掉落/奖励守恒
using System;
using System.Collections.Generic;
using UnityEngine;
using StudyFarm.Data;

namespace StudyFarm.Core
{
    public class EconomyController
    {
        // 商店价格
        const int SeedCommonPrice = 5;
        const int FertilizerPrice = 15;
        const int PotionPrice = 40;

        public void Init(GameSave save) { }

        public bool BuySeed(GameSave save)
        {
            if (save.fruit < SeedCommonPrice) return false;
            save.fruit -= SeedCommonPrice;
            save.inventory["seed_common"] = save.inventory.GetValueOrDefault("seed_common") + 1;
            return true;
        }

        public bool BuyFertilizer(GameSave save)
        {
            if (save.fruit < FertilizerPrice) return false;
            save.fruit -= FertilizerPrice;
            save.inventory["fertilizer"] = save.inventory.GetValueOrDefault("fertilizer") + 1;
            return true;
        }

        public bool BuyPotion(GameSave save)
        {
            if (save.fruit < PotionPrice) return false;
            save.fruit -= PotionPrice;
            save.inventory["potion"] = save.inventory.GetValueOrDefault("potion") + 1;
            return true;
        }

        // 收获产出：基础 20 × 稀有度系数
        public int HarvestYield(string rarity)
        {
            switch (rarity)
            {
                case "common": return 20;
                case "rare": return 40;
                case "epic": return 80;
                case "legendary": return 160;
                default: return 20;
            }
        }

        public void GrantHarvest(GameSave save, string kpId, string rarity)
        {
            int y = HarvestYield(rarity);
            save.fruit += y;
            save.mastered.Add(kpId);
        }

        // 通关奖励
        public void GrantLevelReward(GameSave save, LevelReward r)
        {
            save.fruit += r.fruit;
            save.inventory["seed_common"] = save.inventory.GetValueOrDefault("seed_common") + r.seeds;
        }

        // 星级提升补差奖励（R11.7）：每提升 1 星 +20 果实
        public void GrantLevelUpgrade(GameSave save, int starDiff)
        {
            if (starDiff > 0)
                save.fruit += starDiff * 20;
        }

        // 章末宝箱奖励（R11.9）
        public void GrantChapterChest(GameSave save)
        {
            save.fruit += 60;
            save.inventory["rare_seed"] = save.inventory.GetValueOrDefault("rare_seed") + 2;
        }

        // 暴击：连对 3 题 +1 果实
        public void GrantCrit(GameSave save)
        {
            save.fruit += 1;
        }

        // 随机掉落（R8）：传说级全局限流每 30 天 1 次，掉落写入 inventory
        public string RandomDrop(GameSave save)
        {
            var roll = UnityEngine.Random.value;
            string drop = null;
            if (roll < 0.02)
            {
                long now = DateTimeOffset.Now.ToUnixTimeSeconds();
                bool legendaryAllowed = save.lastLegendaryDropUnix == 0 ||
                    now - save.lastLegendaryDropUnix >= 30 * 86400;
                drop = legendaryAllowed ? "legendary_seed" : "rare_seed"; // 限流期降级
                if (legendaryAllowed) save.lastLegendaryDropUnix = now;
            }
            else if (roll < 0.10) drop = "rare_seed";
            else if (roll < 0.25) drop = "decor";

            if (drop != null)
                save.inventory[drop] = save.inventory.GetValueOrDefault(drop) + 1;
            return drop;
        }
    }
}
