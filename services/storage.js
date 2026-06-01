// ============================================================
// Storage Manager - Chrome Storage 封装
// ============================================================

const StorageManager = {
  /**
   * 获取 AI 配置
   */
  async getAIConfig() {
    return new Promise((resolve) => {
      chrome.storage.sync.get(['aiConfig'], (result) => {
        resolve(result.aiConfig || null);
      });
    });
  },

  /**
   * 保存 AI 配置
   */
  async setAIConfig(config) {
    return new Promise((resolve) => {
      chrome.storage.sync.set({ aiConfig: config }, resolve);
    });
  },

  /**
   * 获取当前页面的 JD
   */
  async getCurrentJD() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['currentJD', 'jdAnalysis'], (result) => {
        resolve({
          jd: result.currentJD || null,
          analysis: result.jdAnalysis || null,
        });
      });
    });
  },

  /**
   * 保存当前 JD 和分析结果
   */
  async setCurrentJD(jd, analysis) {
    return new Promise((resolve) => {
      chrome.storage.local.set(
        {
          currentJD: jd,
          jdAnalysis: analysis,
          jdTimestamp: Date.now(),
        },
        resolve
      );
    });
  },

  /**
   * 获取生成的面试题
   */
  async getQuestions() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['interviewQuestions'], (result) => {
        resolve(result.interviewQuestions || null);
      });
    });
  },

  /**
   * 保存面试题
   */
  async setQuestions(questions) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ interviewQuestions: questions }, resolve);
    });
  },

  /**
   * 获取面试记录
   */
  async getInterviewHistory() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['interviewHistory'], (result) => {
        resolve(result.interviewHistory || []);
      });
    });
  },

  /**
   * 追加面试记录
   */
  async appendHistory(record) {
    const history = await this.getInterviewHistory();
    history.push({ ...record, timestamp: Date.now() });
    return new Promise((resolve) => {
      chrome.storage.local.set({ interviewHistory: history }, resolve);
    });
  },

  /**
   * 清除本次面试数据
   */
  async clearSession() {
    return new Promise((resolve) => {
      chrome.storage.local.remove(
        ['currentJD', 'jdAnalysis', 'jdTimestamp', 'interviewQuestions', 'interviewHistory'],
        resolve
      );
    });
  },

  /**
   * 获取使用次数统计（用于免费额度管理）
   */
  async getUsageStats() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['usageStats'], (result) => {
        const stats = result.usageStats || {
          totalSessions: 0,
          todaySessions: 0,
          todayDate: '',
          totalJDAnalysis: 0,
        };
        // 重置每日计数
        const today = new Date().toISOString().slice(0, 10);
        if (stats.todayDate !== today) {
          stats.todaySessions = 0;
          stats.todayDate = today;
        }
        resolve(stats);
      });
    });
  },

  /**
   * 增加使用次数
   */
  async incrementUsage(type = 'session') {
    const stats = await this.getUsageStats();
    if (type === 'session') {
      stats.totalSessions++;
      stats.todaySessions++;
    } else if (type === 'jd') {
      stats.totalJDAnalysis++;
    }
    return new Promise((resolve) => {
      chrome.storage.local.set({ usageStats: stats }, resolve);
    });
  },

  /**
   * 获取显示模式: 'sidepanel' | 'newtab' | 'embedded'
   */
  async getDisplayMode() {
    return new Promise((resolve) => {
      chrome.storage.sync.get(['displayMode'], (result) => {
        resolve(result.displayMode || 'sidepanel');
      });
    });
  },

  /**
   * 保存显示模式
   */
  async setDisplayMode(mode) {
    return new Promise((resolve) => {
      chrome.storage.sync.set({ displayMode: mode }, resolve);
    });
  },
};

// ES module 导出
export { StorageManager };

if (typeof globalThis !== 'undefined') globalThis.StorageManager = StorageManager;
if (typeof self !== 'undefined') self.StorageManager = StorageManager;
