// FarmController.cs — 地块交互：播种/浇水答题/收获/蔫萎
using System;
using System.Collections.Generic;
using UnityEngine;
using StudyFarm.Data;

namespace StudyFarm.Core
{
    public struct PlantResult
    {
        public bool ok;
        public string msg;
    }

    public struct HarvestResult
    {
        public bool ok;
        public int fruit;
        public string rarity;
    }

    public class FarmController
    {
        const int FieldSlots = 6; // v1 每区 6 块地

        public void Init(GameSave save) { }

        // 播种：扣 1 种子，创建 growth=0 作物
        public PlantResult Plant(GameSave save, string kpId, string cropType = "seed_common")
        {
            if (!save.inventory.TryGetValue(cropType, out int have) || have < 1)
                return new PlantResult { ok = false, msg = "种子不足，请去商店购买" };

            // 已有该 kp 作物则不允许重复播种
            foreach (var c in save.crops)
                if (c.kpId == kpId)
                    return new PlantResult { ok = false, msg = "该知识点已在生长" };

            save.inventory[cropType] = have - 1;
            save.crops.Add(new CropState
            {
                kpId = kpId,
                growth = 0,
                interval = 0,
                ease = 2.2f,
                state = "growing",
            });
            return new PlantResult { ok = true, msg = "播种成功" };
        }

        // 收获：growth==5 → 产出果实，重置地块（果实与掉落在 Econ 结算）
        public HarvestResult Harvest(GameSave save, string kpId, string rarity, EconomyController econ = null)
        {
            var c = save.crops.Find(x => x.kpId == kpId);
            if (c == null || c.growth < Scheduler.HarvestGrowth)
                return new HarvestResult { ok = false, fruit = 0 };
            save.crops.Remove(c);
            if (econ != null)
            {
                econ.GrantHarvest(save, kpId, rarity);
                econ.RandomDrop(save); // R8.1 收获随机掉落
            }
            return new HarvestResult { ok = true, fruit = econ != null ? econ.HarvestYield(rarity) : 0, rarity = rarity };
        }

        // 用化肥恢复蔫萎
        public bool UseFertilizer(GameSave save, string kpId, Scheduler scheduler)
        {
            if (!save.inventory.TryGetValue("fertilizer", out int f) || f < 1) return false;
            save.inventory["fertilizer"] = f - 1;
            scheduler.ApplyFertilizer(save, kpId);
            return true;
        }

        public int DueCount(GameSave save, Scheduler scheduler)
        {
            return scheduler.GetDueKnowledgePoints(save).Count;
        }
    }
}
