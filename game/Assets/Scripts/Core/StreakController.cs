// StreakController.cs — 每日签到与 streak（R7）
using System;
using System.Collections.Generic;
using UnityEngine;
using StudyFarm.Data;

namespace StudyFarm.Core
{
    public class StreakController
    {
        // 学习行为（浇水/闯关）完成后调用
        public void OnActive(GameSave save)
        {
            string today = DateTime.Now.ToString("yyyy-MM-dd");
            if (save.streak.lastActiveDate == today) return; // 当日已计

            string yesterday = DateTime.Now.AddDays(-1).ToString("yyyy-MM-dd");
            if (save.streak.lastActiveDate == yesterday)
                save.streak.current++;
            else if (!string.IsNullOrEmpty(save.streak.lastActiveDate))
            {
                // 断档（超 1 天）→ 清零（R7.2）；48h 内可用挽回药剂
                save.streak.current = 0;
            }
            else
            {
                save.streak.current = 1;
            }
            save.streak.lastActiveDate = today;
            save.streak.best = Math.Max(save.streak.best, save.streak.current);

            // 里程碑奖励（R7.4）
            if (save.streak.current is 7 or 30 or 100)
            {
                save.fruit += 50;
            }
        }

        // 挽回药剂：清零后 48h 内恢复，每月限 1 次（R7.3）
        public bool UseRescue(GameSave save)
        {
            if (save.streak.current == 0 && !save.streak.rescueUsedThisMonth
                && save.streak.best > 0)
            {
                // 简化：恢复到 best 前一日
                save.streak.current = Math.Max(1, save.streak.best - 1);
                save.streak.rescueUsedThisMonth = true;
                save.streak.rescueMonth = DateTime.Now.ToString("yyyy-MM");
                if (!save.inventory.ContainsKey("potion") || save.inventory["potion"] < 1) return false;
                save.inventory["potion"]--;
                return true;
            }
            return false;
        }
    }
}
