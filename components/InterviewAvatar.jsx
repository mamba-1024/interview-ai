// ============================================================
// InterviewAvatar - AI 面试官头像（3D 渲染风格）
// 支持 male / female 两种形象，随机分配
// ============================================================

import React, { useMemo } from 'react';

const AVATARS = {
  male: 'icons/ai-avatar-male.png',
  female: 'icons/ai-avatar-female.png',
};

const InterviewAvatar = ({ isSpeaking, size = 200, gender }) => {
  // 若未指定 gender，组件挂载时随机选一个
  const avatarSrc = useMemo(() => {
    if (gender && AVATARS[gender]) return AVATARS[gender];
    return Math.random() > 0.5 ? AVATARS.male : AVATARS.female;
  }, [gender]);

  return (
    <div className="ir-avatar-wrap" style={{ width: size, height: size }}>
      {/* 背景光环 */}
      <div className={`ir-avatar-glow ${isSpeaking ? 'ir-avatar-glow--active' : ''}`} />

      <img
        src={avatarSrc}
        alt="AI Interviewer"
        className="ir-avatar-img"
        draggable={false}
      />

      {/* 说话状态指示器 */}
      <div className={`ir-avatar-status ${isSpeaking ? 'ir-avatar-status--speaking' : ''}`}>
        {isSpeaking && (
          <>
            <span className="ir-wave-bar" />
            <span className="ir-wave-bar" />
            <span className="ir-wave-bar" />
          </>
        )}
      </div>
    </div>
  );
};

export default InterviewAvatar;
