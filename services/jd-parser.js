// ============================================================
// JD Parser - 各招聘网站岗位描述提取
// ============================================================

const JDParsers = {
  /**
   * BOSS直聘 - 支持列表页和详情页
   */
  zhipin: {
    match: (url) => url.includes('zhipin.com'),
    extract: () => {
      // 1. 先尝试提取右侧展开的职位详情面板（列表页点击某个职位后展开）
      const detailPanel = document.querySelector('.job-detail-box, .job-detail-section, [class*="job-detail"]');
      if (detailPanel) {
        const detailResult = extractZhipinDetail(detailPanel);
        if (detailResult.fullText.trim().length > 20) {
          return detailResult;
        }
      }

      // 2. 尝试完整的职位详情页
      const pageResult = extractZhipinDetailPage();
      if (pageResult.fullText.trim().length > 20) {
        return pageResult;
      }

      // 3. 列表页：提取所有可见的职位卡片
      const cards = document.querySelectorAll('.job-card-wrapper, .job-card-body, [class*="job-card"]');
      if (cards.length > 0) {
        return extractZhipinListing(cards);
      }

      // 4. 兜底：通用 class 模糊匹配
      return extractZhipinGeneric();
    },
  },

  /**
   * 拉勾网
   */
  lagou: {
    match: (url) => url.includes('lagou.com'),
    extract: () => {
      const result = { title: '', company: '', salary: '', jd: '', location: '' };

      const titleEl =
        document.querySelector('.position-head-wrap .position-head-wrap-position-name') ||
        document.querySelector('[class*="position-name"]');
      result.title = titleEl?.textContent?.trim() || '';

      const companyEl =
        document.querySelector('.position-head-wrap .position-head-wrap-company-name') ||
        document.querySelector('[class*="company-name"]');
      result.company = companyEl?.textContent?.trim() || '';

      const salaryEl =
        document.querySelector('.position-head-wrap .position-head-wrap-salary') ||
        document.querySelector('[class*="salary"]');
      result.salary = salaryEl?.textContent?.trim() || '';

      const jdEl =
        document.querySelector('.position-detail .job_detail') ||
        document.querySelector('.job-detail .position-detail') ||
        document.querySelector('[class*="job_detail"]');
      result.jd = jdEl?.textContent?.trim() || '';

      return {
        ...result,
        fullText: `${result.title}\n公司: ${result.company}\n薪资: ${result.salary}\n\n${result.jd}`,
      };
    },
  },

  /**
   * LinkedIn
   */
  linkedin: {
    match: (url) => url.includes('linkedin.com'),
    extract: () => {
      const result = { title: '', company: '', salary: '', jd: '', location: '' };

      const titleEl = document.querySelector('.top-card-layout__title, .job-details-jobs-unified-top-card__job-title h1');
      result.title = titleEl?.textContent?.trim() || '';

      const companyEl = document.querySelector('.top-card-layout__second-subline a, .job-details-jobs-unified-top-card__company-name');
      result.company = companyEl?.textContent?.trim() || '';

      const locationEl = document.querySelector('.top-card-layout__bullet, .job-details-jobs-unified-top-card__primary-description');
      result.location = locationEl?.textContent?.trim() || '';

      const jdEl = document.querySelector('.show-more-less-html__markup, .description__text');
      result.jd = jdEl?.textContent?.trim() || '';

      return {
        ...result,
        fullText: `${result.title}\n公司: ${result.company}\n地点: ${result.location}\n\n${result.jd}`,
      };
    },
  },

  /**
   * 智联招聘
   */
  zhaopin: {
    match: (url) => url.includes('zhaopin.com'),
    extract: () => {
      const result = { title: '', company: '', salary: '', jd: '', location: '' };

      const titleEl = document.querySelector('.position-header__title .info__name') || document.querySelector('h1');
      result.title = titleEl?.textContent?.trim() || '';

      const companyEl = document.querySelector('.position-header__title .info__company') || document.querySelector('.company__name');
      result.company = companyEl?.textContent?.trim() || '';

      const salaryEl = document.querySelector('.position-header__salary .salary') || document.querySelector('[class*="salary"]');
      result.salary = salaryEl?.textContent?.trim() || '';

      const jdEl = document.querySelector('.position-detail__content') || document.querySelector('.job-detail');
      result.jd = jdEl?.textContent?.trim() || '';

      return {
        ...result,
        fullText: `${result.title}\n公司: ${result.company}\n薪资: ${result.salary}\n\n${result.jd}`,
      };
    },
  },

  /**
   * 猎聘
   */
  liepin: {
    match: (url) => url.includes('liepin.com'),
    extract: () => {
      const result = { title: '', company: '', salary: '', jd: '', location: '' };

      const titleEl = document.querySelector('.title-info .name h1') || document.querySelector('[class*="job-title"]');
      result.title = titleEl?.textContent?.trim() || '';

      const companyEl = document.querySelector('.title-info .company h3') || document.querySelector('[class*="company-name"]');
      result.company = companyEl?.textContent?.trim() || '';

      const salaryEl = document.querySelector('.job-info .salary') || document.querySelector('[class*="salary"]');
      result.salary = salaryEl?.textContent?.trim() || '';

      const jdEl = document.querySelector('.job-detail-content') || document.querySelector('[class*="job-detail"]');
      result.jd = jdEl?.textContent?.trim() || '';

      return {
        ...result,
        fullText: `${result.title}\n公司: ${result.company}\n薪资: ${result.salary}\n\n${result.jd}`,
      };
    },
  },

  /**
   * 牛客网
   */
  nowcoder: {
    match: (url) => url.includes('nowcoder.com'),
    extract: () => {
      const result = { title: '', company: '', salary: '', jd: '', location: '' };

      const titleEl = document.querySelector('.job-detail-title') || document.querySelector('h1');
      result.title = titleEl?.textContent?.trim() || '';

      const companyEl = document.querySelector('.job-detail-company') || document.querySelector('[class*="company"]');
      result.company = companyEl?.textContent?.trim() || '';

      const jdEl = document.querySelector('.job-detail-content') || document.querySelector('[class*="job-desc"]');
      result.jd = jdEl?.textContent?.trim() || '';

      return {
        ...result,
        fullText: `${result.title}\n公司: ${result.company}\n\n${result.jd}`,
      };
    },
  },

  /**
   * Indeed — 全球最大招聘搜索引擎
   * 支持各地区子域名 (us.indeed.com, uk.indeed.com, jp.indeed.com 等)
   */
  indeed: {
    match: (url) => url.includes('indeed.com'),
    extract: () => {
      const result = { title: '', company: '', salary: '', jd: '', location: '' };

      // 职位标题
      const titleEl =
        document.querySelector('.jobsearch-JobInfoPane-title, .jobsearch-JobInfoPane-subtitle h1') ||
        document.querySelector('[class*="jobsearch-JobInfoPane"] h1') ||
        document.querySelector('h1.jobsearch-JobInfoPane-title');
      result.title = titleEl?.textContent?.trim() || '';

      // 公司名
      const companyEl =
        document.querySelector('[data-company-name]') ||
        document.querySelector('.jobsearch-InlineCompanyRating div:first-child') ||
        document.querySelector('[class*="company"] a');
      result.company = companyEl?.textContent?.trim() || '';

      // 地点
      const locationEl =
        document.querySelector('[class*="jobsearch-JobInfoPane-subtitle"] div:last-child') ||
        document.querySelector('.jobsearch-JobInfoPane-subtitle > div:nth-child(2)');
      result.location = locationEl?.textContent?.trim() || '';

      // 薪资
      const salaryEl =
        document.querySelector('.jobsearch-JobMetadataHeader-item') ||
        document.querySelector('[class*="salary"]');
      result.salary = salaryEl?.textContent?.trim() || '';

      // JD 正文
      const jdEl =
        document.querySelector('#jobDescriptionText, .jobsearch-jobDescriptionText') ||
        document.querySelector('[class*="jobDescriptionText"]');
      result.jd = jdEl?.textContent?.trim() || '';

      return {
        ...result,
        fullText: buildFullText(result.title, result.company, result.salary, result.location, result.jd, [], []),
      };
    },
  },

  /**
   * Glassdoor — 公司评价 + 招聘
   */
  glassdoor: {
    match: (url) => url.includes('glassdoor.com'),
    extract: () => {
      const result = { title: '', company: '', salary: '', jd: '', location: '' };

      // 职位标题
      const titleEl =
        document.querySelector('[class*="jobViewHeader"] h1') ||
        document.querySelector('.JobDetails_jobDetails__title') ||
        document.querySelector('[class*="job-title"]') ||
        document.querySelector('h1');
      result.title = titleEl?.textContent?.trim() || '';

      // 公司名
      const companyEl =
        document.querySelector('[class*="jobViewHeader"] [class*="employer"]') ||
        document.querySelector('.EmployerProfile_compactEmployerName') ||
        document.querySelector('[class*="employer-name"]');
      result.company = companyEl?.textContent?.trim() || '';

      // 地点
      const locationEl =
        document.querySelector('[class*="jobViewHeader"] [class*="location"]') ||
        document.querySelector('[class*="location"]');
      result.location = locationEl?.textContent?.trim() || '';

      // 薪资
      const salaryEl =
        document.querySelector('[class*="salary"]') ||
        document.querySelector('[class*="Salary"]');
      result.salary = salaryEl?.textContent?.trim() || '';

      // JD 正文
      const jdEl =
        document.querySelector('[class*="JobDetails"] [class*="desc"]') ||
        document.querySelector('.JobDetails_jobDescription__content') ||
        document.querySelector('[class*="jobDescription"]');
      result.jd = jdEl?.textContent?.trim() || '';

      return {
        ...result,
        fullText: buildFullText(result.title, result.company, result.salary, result.location, result.jd, [], []),
      };
    },
  },

  /**
   * Wellfound (原 AngelList) — 创业公司 / 科技岗位
   */
  wellfound: {
    match: (url) => url.includes('wellfound.com') || url.includes('angel.co'),
    extract: () => {
      const result = { title: '', company: '', salary: '', jd: '', location: '' };

      // 职位标题
      const titleEl =
        document.querySelector('[class*="job-title"]') ||
        document.querySelector('h1') ||
        document.querySelector('[class*="listing-title"]');
      result.title = titleEl?.textContent?.trim() || '';

      // 公司名
      const companyEl =
        document.querySelector('[class*="company-name"]') ||
        document.querySelector('[class*="startup-name"]') ||
        document.querySelector('a[class*="company"]');
      result.company = companyEl?.textContent?.trim() || '';

      // 地点
      const locationEl =
        document.querySelector('[class*="location"]') ||
        document.querySelector('[class*="city"]');
      result.location = locationEl?.textContent?.trim() || '';

      // 薪资
      const salaryEl =
        document.querySelector('[class*="salary"]') ||
        document.querySelector('[class*="compensation"]');
      result.salary = salaryEl?.textContent?.trim() || '';

      // JD 正文
      const jdEl =
        document.querySelector('[class*="job-description"]') ||
        document.querySelector('[class*="listing-description"]') ||
        document.querySelector('[class*="description"]');
      result.jd = jdEl?.textContent?.trim() || '';

      // 技能标签
      const tagEls = document.querySelectorAll('[class*="skill"] span, [class*="tag"] span');
      const tags = Array.from(tagEls).map(el => el.textContent.trim()).filter(Boolean);

      return {
        ...result, tags,
        fullText: buildFullText(result.title, result.company, result.salary, result.location, result.jd, tags, []),
      };
    },
  },

  /**
   * Dice — 技术 / IT 岗位
   */
  dice: {
    match: (url) => url.includes('dice.com'),
    extract: () => {
      const result = { title: '', company: '', salary: '', jd: '', location: '' };

      // 职位标题
      const titleEl =
        document.querySelector('[data-cy="jobTitle"]') ||
        document.querySelector('h1[class*="title"]') ||
        document.querySelector('[class*="job-title"]') ||
        document.querySelector('h1');
      result.title = titleEl?.textContent?.trim() || '';

      // 公司名
      const companyEl =
        document.querySelector('[data-cy="employerName"]') ||
        document.querySelector('[class*="company-name"]') ||
        document.querySelector('[class*="employer"]');
      result.company = companyEl?.textContent?.trim() || '';

      // 地点
      const locationEl =
        document.querySelector('[data-cy="jobLocation"]') ||
        document.querySelector('[class*="location"]');
      result.location = locationEl?.textContent?.trim() || '';

      // 薪资
      const salaryEl =
        document.querySelector('[data-cy="jobSalary"]') ||
        document.querySelector('[class*="salary"]');
      result.salary = salaryEl?.textContent?.trim() || '';

      // JD 正文
      const jdEl =
        document.querySelector('[data-cy="jobDescription"]') ||
        document.querySelector('[class*="job-description"]') ||
        document.querySelector('[class*="jobDetail"]');
      result.jd = jdEl?.textContent?.trim() || '';

      // 技能标签
      const tagEls = document.querySelectorAll('[data-cy="skills"] span, [class*="skill-tag"]');
      const tags = Array.from(tagEls).map(el => el.textContent.trim()).filter(Boolean);

      return {
        ...result, tags,
        fullText: buildFullText(result.title, result.company, result.salary, result.location, result.jd, tags, []),
      };
    },
  },

  /**
   * Monster — 全球经典招聘网站
   */
  monster: {
    match: (url) => url.includes('monster.com'),
    extract: () => {
      const result = { title: '', company: '', salary: '', jd: '', location: '' };

      // 职位标题
      const titleEl =
        document.querySelector('[class*="header__title"]') ||
        document.querySelector('h1[class*="title"]') ||
        document.querySelector('h1');
      result.title = titleEl?.textContent?.trim() || '';

      // 公司名
      const companyEl =
        document.querySelector('[class*="header__company"]') ||
        document.querySelector('[class*="company-name"]') ||
        document.querySelector('[class*="employer"]');
      result.company = companyEl?.textContent?.trim() || '';

      // 地点
      const locationEl =
        document.querySelector('[class*="header__location"]') ||
        document.querySelector('[class*="location"]');
      result.location = locationEl?.textContent?.trim() || '';

      // 薪资
      const salaryEl = document.querySelector('[class*="salary"]');
      result.salary = salaryEl?.textContent?.trim() || '';

      // JD 正文
      const jdEl =
        document.querySelector('[class*="job-description"]') ||
        document.querySelector('#JobDescription') ||
        document.querySelector('[class*="jobDetail"]');
      result.jd = jdEl?.textContent?.trim() || '';

      return {
        ...result,
        fullText: buildFullText(result.title, result.company, result.salary, result.location, result.jd, [], []),
      };
    },
  },
};

// ============================================================
// BOSS直聘 辅助提取函数
// ============================================================

/** 数组去重 */
function dedupe(arr) {
  return [...new Set(arr)];
}

/**
 * 从详情面板/详情页提取（列表页右侧展开面板 或 独立详情页）
 */
function extractZhipinDetail(container) {
  const title =
    container.querySelector('.job-title, .name h1, [class*="job-name"], h1')?.textContent?.trim() || '';
  const company =
    container.querySelector('.company-name, .sider-company .name, [class*="company-name"]')?.textContent?.trim() || '';
  const salary =
    container.querySelector('.salary, [class*="salary"]')?.textContent?.trim() || '';
  const location =
    container.querySelector('.job-area, .location-address, [class*="job-area"], [class*="location"]')?.textContent?.trim() || '';

  // JD 正文
  const jdEl =
    container.querySelector('.job-sec-text, .job-detail-content, [class*="job-sec-text"], [class*="job-desc"]');
  const jd = jdEl?.textContent?.trim() || '';

  // 信息描述（经验、学历等）
  const infoEls = container.querySelectorAll('.info-desc span, .job-info .info-desc span, [class*="info-desc"] span');
  const infoItems = dedupe(Array.from(infoEls).map((el) => el.textContent.trim()).filter(Boolean));

  // 标签（排除与 infoItems/location 重复的）
  const tagEls = container.querySelectorAll('.tag-list li, .tag-list span, .job-tags .tag-item, .job-keyword span');
  const excludeSet = new Set([...infoItems, location]);
  const tags = dedupe(Array.from(tagEls).map((el) => el.textContent.trim()).filter((t) => t && !excludeSet.has(t)));

  return {
    title, company, salary, location, jd, tags, infoItems,
    fullText: buildFullText(title, company, salary, location, jd, tags, infoItems),
  };
}

/**
 * 完整详情页提取
 */
function extractZhipinDetailPage() {
  const title =
    document.querySelector('.info-primary .name h1') ||
    document.querySelector('.job-banner .name h1') ||
    document.querySelector('.name-title') ||
    document.querySelector('[ka="header-info-name"]');
  const titleText = title?.textContent?.trim() || '';

  const company =
    document.querySelector('.info-primary .name h3') ||
    document.querySelector('.sider-company .name') ||
    document.querySelector('.job-banner .name h3');
  const companyText = company?.textContent?.trim() || '';

  const salary =
    document.querySelector('.info-primary .salary') ||
    document.querySelector('.job-banner .salary');
  const salaryText = salary?.textContent?.trim() || '';

  const location =
    document.querySelector('.job-banner .location-address') ||
    document.querySelector('.job-address .location') ||
    document.querySelector('.job-area');
  const locationText = location?.textContent?.trim() || '';

  const jdEl =
    document.querySelector('.job-detail .job-sec-text') ||
    document.querySelector('.job-detail-section .job-sec-text') ||
    document.querySelector('[class*="job-detail"] [class*="text"]');
  const jd = jdEl?.textContent?.trim() || '';

  const tagEls = document.querySelectorAll('.job-tags .tag-item, .job-keyword .tag-list span, .tag-list li');
  const infoEls = document.querySelectorAll('.info-primary .info-desc span, .job-info .info-desc span');
  const infoItems = dedupe(Array.from(infoEls).map((el) => el.textContent.trim()).filter(Boolean));
  const excludeSet = new Set([...infoItems, locationText]);
  const tags = dedupe(Array.from(tagEls).map((el) => el.textContent.trim()).filter((t) => t && !excludeSet.has(t)));

  return {
    title: titleText, company: companyText, salary: salaryText,
    location: locationText, jd, tags, infoItems,
    fullText: buildFullText(titleText, companyText, salaryText, locationText, jd, tags, infoItems),
  };
}

/**
 * 列表页提取 - 从职位卡片中提取所有信息
 * 如果有选中的卡片（右侧有详情面板），优先使用那个
 */
function extractZhipinListing(cards) {
  // 检查是否有选中的卡片（通常有 active/selected class）
  const activeCard = document.querySelector('.job-card-wrapper.active, .job-card-wrapper.cur, [class*="job-card"][class*="active"]');
  const targetCard = activeCard || cards[0];

  const title =
    targetCard.querySelector('.job-name, [class*="job-name"]')?.textContent?.trim() || '';
  const company =
    targetCard.querySelector('.company-name, [class*="company-name"]')?.textContent?.trim() || '';
  const salary =
    targetCard.querySelector('.salary, [class*="salary"]')?.textContent?.trim() || '';
  const location =
    targetCard.querySelector('.job-area, [class*="job-area"]')?.textContent?.trim() || '';

  // infoItems: 经验、学历等基础要求（仅从 .info-desc）
  const infoEls = targetCard.querySelectorAll('.info-desc span, [class*="info-desc"] span');
  const infoItems = dedupe(Array.from(infoEls).map((el) => el.textContent.trim()).filter(Boolean));

  // tags: 技能标签（仅从 .tag-list，排除与 infoItems 重复的）
  const tagEls = targetCard.querySelectorAll('.tag-list li, .tag-list span');
  const rawTags = Array.from(tagEls).map((el) => el.textContent.trim()).filter(Boolean);
  const excludeSet = new Set([...infoItems, location]);
  const tags = dedupe(rawTags.filter((t) => !excludeSet.has(t)));

  // 同时尝试获取右侧详情面板的内容（如果已展开）
  const detailJd = document.querySelector('.job-sec-text, .job-detail-content, [class*="job-sec-text"]');
  const jd = detailJd?.textContent?.trim() || '';

  // 收集所有卡片的基本信息作为附加信息
  const jobCount = cards.length;
  const jobsList = Array.from(cards).slice(0, 10).map((card) => {
    const jTitle = card.querySelector('.job-name, [class*="job-name"]')?.textContent?.trim() || '';
    const jCompany = card.querySelector('.company-name, [class*="company-name"]')?.textContent?.trim() || '';
    const jSalary = card.querySelector('.salary, [class*="salary"]')?.textContent?.trim() || '';
    const jArea = card.querySelector('.job-area, [class*="job-area"]')?.textContent?.trim() || '';
    return `${jTitle} | ${jCompany} | ${jSalary} | ${jArea}`;
  });

  let fullText = buildFullText(title, company, salary, location, jd, tags, infoItems);
  if (jobCount > 1) {
    fullText += `\n\n--- 当前页面共 ${jobCount} 个相关职位 ---\n${jobsList.join('\n')}`;
  }

  return { title, company, salary, location, jd, tags, infoItems, fullText };
}

/**
 * 通用兜底提取（模糊匹配 class）
 */
function extractZhipinGeneric() {
  // 尝试各种可能的选择器
  const titleEl =
    document.querySelector('[class*="job-name"]') ||
    document.querySelector('[class*="job-title"]') ||
    document.querySelector('[class*="position-name"]') ||
    document.querySelector('h1');
  const title = titleEl?.textContent?.trim() || '';

  const companyEl =
    document.querySelector('[class*="company-name"]') ||
    document.querySelector('[class*="company"]');
  const company = companyEl?.textContent?.trim() || '';

  const salaryEl = document.querySelector('[class*="salary"]');
  const salary = salaryEl?.textContent?.trim() || '';

  const locationEl =
    document.querySelector('[class*="job-area"]') ||
    document.querySelector('[class*="location"]') ||
    document.querySelector('[class*="address"]');
  const location = locationEl?.textContent?.trim() || '';

  const jdEl =
    document.querySelector('[class*="job-sec-text"]') ||
    document.querySelector('[class*="job-desc"]') ||
    document.querySelector('[class*="job-detail"]');
  const jd = jdEl?.textContent?.trim() || '';

  return {
    title, company, salary, location, jd, tags: [], infoItems: [],
    fullText: buildFullText(title, company, salary, location, jd, [], []),
  };
}

/**
 * 构建 fullText
 */
function buildFullText(title, company, salary, location, jd, tags, infoItems) {
  const parts = [];
  if (title) parts.push(title);
  if (company) parts.push(`公司: ${company}`);
  if (salary) parts.push(`薪资: ${salary}`);
  if (location) parts.push(`地点: ${location}`);
  if (infoItems?.length) parts.push(`要求: ${infoItems.join(' | ')}`);
  if (jd) parts.push(`\n${jd}`);
  if (tags?.length) parts.push(`\n技能标签: ${tags.join(', ')}`);
  return parts.join('\n');
}

/**
 * 自动检测网站并提取 JD
 */
function extractJD() {
  const url = window.location.href;

  for (const [, parser] of Object.entries(JDParsers)) {
    if (parser.match(url)) {
      try {
        const result = parser.extract();
        if (result.fullText && result.fullText.trim().length > 20) {
          return { success: true, ...result, source: url };
        }
      } catch (e) {
        console.warn('[InterviewAI] JD 解析出错:', e);
      }
    }
  }

  // 兜底：尝试从页面中通用提取
  return fallbackExtract();
}

/**
 * 通用兜底提取
 */
function fallbackExtract() {
  // 尝试匹配常见的 JD 容器
  const selectors = [
    '[class*="job-detail"]',
    '[class*="job-desc"]',
    '[class*="job-content"]',
    '[class*="position-detail"]',
    '[class*="job-info"]',
    '[class*="description"]',
    'article',
  ];

  let bestText = '';
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el && el.textContent.trim().length > bestText.length) {
      bestText = el.textContent.trim();
    }
  }

  // 获取页面标题作为岗位名
  const title =
    document.querySelector('h1')?.textContent?.trim() ||
    document.title.replace(/[-_|].+$/, '').trim();

  if (bestText.length > 30) {
    return {
      success: true,
      title,
      company: '',
      salary: '',
      jd: bestText,
      location: '',
      fullText: `${title}\n\n${bestText}`,
      source: window.location.href,
    };
  }

  return { success: false, error: '未检测到岗位描述，请确保当前页面包含JD信息' };
}

// ES module 导出
export { JDParsers, extractJD, fallbackExtract };

// 同时暴露给全局（供 background 通过 chrome.scripting 调用）
if (typeof globalThis !== 'undefined') {
  globalThis.extractJD = extractJD;
  globalThis.JDParsers = JDParsers;
}
