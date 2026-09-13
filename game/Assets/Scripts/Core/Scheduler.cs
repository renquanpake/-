// Scheduler.cs — SM-2 Lite 间隔复习调度
using System;
using System.Collections.Generic;
using UnityEngine;
using StudyFarm.Data;

namespace StudyFarm.Core
{
    [Serializable]
    public struct ReviewPlan
    {
        public int newInterval;   // 天
        public float newEase;
        public bool canHarvest;   // growth==5
        public long nextDueUnix;
    }

    public class Scheduler : IScheduler
    {
        public const int HarvestGrowth = 5;

        public void Init(GameSave save) { }

        // 答对/答错 → 新间隔与 ease（design.md SM-2 Lite）
        public ReviewPlan OnAnswer(string kpId, bool correct, GameSave save)
        {
            var crop = FindCrop(save, kpId);
            if (crop == null)
            {
                // 新播种：growth=0
                crop = new CropState { kpId = kpId, growth = 0, interval = 0, ease = 2.2f, state = "growing" };
                save.crops.Add(crop);
            }

            long now = DateTimeOffset.Now.ToUnixTimeSeconds();

            if (correct)
            {
                // 间隔推进
                if (crop.interval == 0) crop.interval = 1;
                else if (crop.interval == 1) crop.interval = 3;
                else crop.interval = (int)Math.Round(crop.interval * crop.ease);
                crop.ease = Math.Min(2.8f, crop.ease + 0.05f);
                if (crop.growth < HarvestGrowth) crop.growth++;
            }
            else
            {
                // 答错：间隔重置 1 天，growth 不变（不倒退，防挫败）
                crop.interval = 1;
                crop.ease = 2.2f;
            }

            if (crop.growth >= HarvestGrowth)
            {
                crop.state = "harvestable";
            }
            else
            {
                // next_due 恒大于当前时间（Correctness Property 5）
                crop.nextDue = now + (long)(crop.interval * 86400);
                crop.state = "growing";
            }

            return new ReviewPlan
            {
                newInterval = crop.interval,
                newEase = crop.ease,
                canHarvest = crop.growth >= HarvestGrowth,
                nextDueUnix = crop.nextDue,
            };
        }

        public List<string> GetDueKnowledgePoints(GameSave save)
        {
            var due = new List<string>();
            long now = DateTimeOffset.Now.ToUnixTimeSeconds();
            foreach (var c in save.crops)
            {
                if (c.nextDue > 0 && c.nextDue <= now) due.Add(c.kpId);
            }
            return due;
        }

        // 蔫萎判定：next_due 超时 24h
        public bool IsWithered(CropState c)
        {
            long now = DateTimeOffset.Now.ToUnixTimeSeconds();
            return c.nextDue > 0 && now - c.nextDue > 86400 && c.state != "harvestable" && c.state != "mastered";
        }

        public void MarkWithered(GameSave save)
        {
            foreach (var c in save.crops)
                if (IsWithered(c) && c.state == "growing")
                    c.state = "withered";
        }

        // 化肥：立即恢复蔫萎并刷新 next_due
        public void ApplyFertilizer(GameSave save, string kpId)
        {
            var c = FindCrop(save, kpId);
            if (c == null) return;
            c.state = "growing";
            long now = DateTimeOffset.Now.ToUnixTimeSeconds();
            c.nextDue = now + (long)(c.interval * 86400);
        }

        CropState FindCrop(GameSave save, string kpId)
        {
            foreach (var c in save.crops)
                if (c.kpId == kpId) return c;
            return null;
        }
    }

    public interface IScheduler
    {
        ReviewPlan OnAnswer(string kpId, bool correct, GameSave save);
        List<string> GetDueKnowledgePoints(GameSave save);
    }
}
