// StreakController.cs — 每日签到与 streak（R7）
using System;
using System.Collections.Generic;
using UnityEngine;
using StudyFarm.Data;

namespace StudyFarm.Core
{
    public class StreakController
    {
        const int DailySigninFruit = 5;
        const long RescueWindowSeconds = 48 * 3600;

        // 学习行为（浇水/闯关）完成后调用
        public void OnActive(GameSave save)
        {
            string today = DateTime.Now.ToString("yyyy-MM-dd");
            if (save.streak.lastActiveDate == today) return; // 当日已计

            string yesterday = DateTime.Now.AddDays(-1).ToString("yyyy-MM-dd");
            if (save.streak.lastActiveDate == yesterday)
            {
                save.streak.current++;
            }
            else if (!string.IsNullOrEmpty(save.streak.lastActiveDate))
            {
                // 断档（超 1 天）→ 记录清零时间与清零前值，清零后今天算新的第 1 天（R7.2）
                save.streak.preZeroStreak = save.streak.current;
                save.streak.zeroedAtUnix = DateTimeOffset.Now.ToUnixTimeSeconds();
                save.streak.current = 1;
            }
            else
            {
                save.streak.current = 1;
            }
            save.streak.lastActiveDate = today;
            save.streak.best = Math.Max(save.streak.best, save.streak.current);

            // 当日签到奖励（R7.1）
            save.fruit += DailySigninFruit;

            // 里程碑奖励（R7.4，分级）
            switch (save.streak.current)
            {
                case 7:
                    save.fruit += 30;
                    break;
                case 30:
                    save.fruit += 100;
                    save.inventory["rare_seed"] = save.inventory.GetValueOrDefault("rare_seed") + 1;
                    break;
                case 100:
                    save.fruit += 300;
                    save.inventory["legendary_deco"] = save.inventory.GetValueOrDefault("legendary_deco") + 1;
                    break;
            }
        }

        // 挽回药剂：清零后 48h 内恢复清零前 streak，每月限 1 次（R7.3）
        public bool UseRescue(GameSave save)
        {
            string curMonth = DateTime.Now.ToString("yyyy-MM");
            if (save.streak.rescueMonth == curMonth) return false; // 本月已用过

            if (!save.inventory.TryGetValue("potion", out int have) || have < 1) return false;

            long now = DateTimeOffset.Now.ToUnixTimeSeconds();
            bool inWindow = save.streak.zeroedAtUnix > 0 && now - save.streak.zeroedAtUnix <= RescueWindowSeconds;
            if (!inWindow) return false;
            if (save.streak.preZeroStreak < 1) return false;

            save.inventory["potion"] = have - 1;
            save.streak.current = save.streak.preZeroStreak;
            save.streak.best = Math.Max(save.streak.best, save.streak.current);
            save.streak.rescueMonth = curMonth;
            save.streak.rescueUsedThisMonth = true;
            save.streak.zeroedAtUnix = 0;
            save.streak.preZeroStreak = 0;
            return true;
        }
    }
}
