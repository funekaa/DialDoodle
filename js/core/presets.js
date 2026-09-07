/**
 * 经典简笔画预设库
 * 所有坐标均以圆心 (0, 0) 为参考系，位于圆心正上方区域（y 值为负数，通常在 -180 到 -20 之间，x 在 -100 到 100 之间）
 * 每个预设为一个 Stroke 集合，每个 Stroke 包含有序点序列 [{x, y}, ...]
 */

export const Presets = {
  // 1. 可爱小熊 (Cute Bear)
  bear: {
    id: 'bear',
    name: '可爱小熊 🐻',
    strokes: [
      // 头部主轮廓 (圆)
      generateEllipse(0, -95, 65, 55, 36),
      // 左耳朵
      generateEllipse(-55, -145, 20, 20, 24, 40, 260),
      // 左耳内廓
      generateEllipse(-55, -145, 12, 12, 16, 50, 250),
      // 右耳朵
      generateEllipse(55, -145, 20, 20, 24, -80, 140),
      // 右耳内廓
      generateEllipse(55, -145, 12, 12, 16, -70, 130),
      // 鼻子区域白椭圆轮廓
      generateEllipse(0, -85, 24, 18, 24),
      // 小黑鼻
      generateEllipse(0, -92, 10, 7, 16),
      // 人中竖线与微笑嘴
      [
        { x: 0, y: -85 },
        { x: 0, y: -78 }
      ],
      generateArc(-8, -78, 8, 8, 12, 0, 180),
      generateArc(8, -78, 8, 8, 12, 0, 180),
      // 左眼
      generateEllipse(-24, -108, 6, 8, 16),
      // 右眼
      generateEllipse(24, -108, 6, 8, 16),
      // 脸颊腮红左
      [
        { x: -48, y: -82 }, { x: -38, y: -82 }
      ],
      // 脸颊腮红右
      [
        { x: 38, y: -82 }, { x: 48, y: -82 }
      ],
      // 小熊两只小爪子趴在下方
      generateArc(-32, -42, 16, 12, 16, 160, 380),
      generateArc(32, -42, 16, 12, 16, 160, 380)
    ]
  },

  // 2. 长耳萌兔 (Cute Bunny)
  bunny: {
    id: 'bunny',
    name: '长耳萌兔 🐰',
    strokes: [
      // 头部脸部轮廓
      generateEllipse(0, -80, 58, 48, 36),
      // 左长耳朵外轮廓
      [
        { x: -30, y: -120 },
        { x: -45, y: -155 },
        { x: -40, y: -180 },
        { x: -25, y: -185 },
        { x: -15, y: -160 },
        { x: -12, y: -125 }
      ],
      // 左长耳朵内部粉色轮廓
      [
        { x: -32, y: -130 },
        { x: -38, y: -155 },
        { x: -35, y: -172 },
        { x: -27, y: -173 },
        { x: -22, y: -155 },
        { x: -18, y: -132 }
      ],
      // 右长耳朵外轮廓
      [
        { x: 12, y: -125 },
        { x: 15, y: -160 },
        { x: 25, y: -185 },
        { x: 40, y: -180 },
        { x: 45, y: -155 },
        { x: 30, y: -120 }
      ],
      // 右长耳朵内部
      [
        { x: 18, y: -132 },
        { x: 22, y: -155 },
        { x: 27, y: -173 },
        { x: 35, y: -172 },
        { x: 38, y: -155 },
        { x: 32, y: -130 }
      ],
      // 左眼与眨光
      generateEllipse(-22, -88, 6, 8, 16),
      // 右眼
      generateEllipse(22, -88, 6, 8, 16),
      // 倒三角小兔鼻
      [
        { x: -6, y: -74 },
        { x: 6, y: -74 },
        { x: 0, y: -68 },
        { x: -6, y: -74 }
      ],
      // 三瓣嘴
      generateArc(-7, -66, 7, 7, 12, 0, 180),
      generateArc(7, -66, 7, 7, 12, 0, 180),
      // 胡须 左
      [{ x: -36, y: -72 }, { x: -62, y: -75 }],
      [{ x: -35, y: -64 }, { x: -60, y: -62 }],
      // 胡须 右
      [{ x: 36, y: -72 }, { x: 62, y: -75 }],
      [{ x: 35, y: -64 }, { x: 60, y: -62 }],
      // 趴着的小手
      generateArc(0, -32, 22, 14, 20, 180, 360)
    ]
  },

  // 3. 俏皮小狗 (Playful Puppy)
  puppy: {
    id: 'puppy',
    name: '俏皮小狗 🐶',
    strokes: [
      // 脸部外轮廓
      generateEllipse(0, -90, 60, 52, 36),
      // 左大垂耳
      [
        { x: -50, y: -115 },
        { x: -75, y: -105 },
        { x: -80, y: -75 },
        { x: -65, y: -55 },
        { x: -52, y: -65 },
        { x: -48, y: -85 }
      ],
      // 右大垂耳
      [
        { x: 50, y: -115 },
        { x: 75, y: -105 },
        { x: 80, y: -75 },
        { x: 65, y: -55 },
        { x: 52, y: -65 },
        { x: 48, y: -85 }
      ],
      // 眼睛左
      generateEllipse(-22, -100, 6, 7, 16),
      // 眼睛右（带斑点圈）
      generateEllipse(22, -100, 6, 7, 16),
      generateEllipse(22, -100, 15, 17, 24),
      // 狗鼻头
      generateEllipse(0, -82, 14, 9, 16),
      // 人中与嘴巴
      [{ x: 0, y: -73 }, { x: 0, y: -66 }],
      generateArc(-9, -66, 9, 8, 14, 0, 180),
      generateArc(9, -66, 9, 8, 14, 0, 180),
      // 吐出的小舌头
      generateArc(0, -58, 8, 12, 16, 0, 180),
      // 领结或蝴蝶结 (解构为完全开放的对称弧线与斜线，杜绝任何三角形闭合口袋)
      [
        { x: -20, y: -48 }, { x: -20, y: -28 }, { x: 0, y: -38 }
      ],
      [
        { x: 20, y: -48 }, { x: 20, y: -28 }, { x: 0, y: -38 }
      ],
      [
        { x: -20, y: -48 }, { x: 0, y: -38 }
      ],
      [
        { x: 20, y: -48 }, { x: 0, y: -38 }
      ],
      generateEllipse(0, -38, 5, 5, 12)
    ]
  },

  // 4. 呆萌小恐龙 (Cute Dino)
  dino: {
    id: 'dino',
    name: '呆萌小恐龙 🦕',
    strokes: [
      // 恐龙脑袋和长脖子身体轮廓
      [
        { x: -45, y: -60 },
        { x: -50, y: -110 },
        { x: -45, y: -135 },
        { x: -20, y: -155 },
        { x: 25, y: -155 },
        { x: 48, y: -140 },
        { x: 48, y: -125 },
        { x: 30, y: -115 },
        { x: 15, y: -115 },
        { x: 0, y: -90 },
        { x: 25, y: -70 },
        { x: 55, y: -60 },
        { x: 65, y: -50 },
        { x: 50, y: -40 },
        { x: 15, y: -40 },
        { x: -25, y: -40 },
        { x: -45, y: -60 }
      ],
      // 恐龙大圆眼睛
      generateEllipse(15, -135, 8, 9, 16),
      generateEllipse(17, -137, 3, 3, 10),
      // 恐龙鼻孔
      generateEllipse(40, -130, 2, 3, 8),
      // 微笑嘴
      generateArc(25, -120, 8, 5, 10, 0, 140),
      // 头部与背部三角形小骨刺
      [{ x: -25, y: -155 }, { x: -30, y: -168 }, { x: -15, y: -157 }],
      [{ x: -10, y: -157 }, { x: -12, y: -172 }, { x: 5, y: -156 }],
      [{ x: 10, y: -156 }, { x: 15, y: -170 }, { x: 25, y: -155 }],
      // 脖子后背骨刺
      [{ x: -48, y: -125 }, { x: -62, y: -130 }, { x: -47, y: -112 }],
      [{ x: -49, y: -100 }, { x: -63, y: -100 }, { x: -47, y: -85 }],
      [{ x: -45, y: -75 }, { x: -58, y: -70 }, { x: -40, y: -60 }],
      // 小肚皮弧线
      generateArc(5, -60, 24, 20, 16, 200, 330),
      // 萌萌小短手
      [
        { x: 18, y: -80 },
        { x: 30, y: -76 },
        { x: 26, y: -70 },
        { x: 15, y: -74 }
      ]
    ]
  },

  // 5. 快乐小汽车 (Happy Car)
  car: {
    id: 'car',
    name: '嘟嘟小汽车 🚗',
    strokes: [
      // 车身主轮廓
      [
        { x: -75, y: -60 },
        { x: -75, y: -80 },
        { x: -55, y: -85 },
        { x: -35, y: -125 },
        { x: 25, y: -125 },
        { x: 50, y: -85 },
        { x: 75, y: -80 },
        { x: 80, y: -60 },
        { x: 55, y: -60 }
      ],
      // 底部车底线（避开轮子）
      [
        { x: 25, y: -60 },
        { x: -25, y: -60 }
      ],
      [
        { x: -55, y: -60 },
        { x: -75, y: -60 }
      ],
      // 车窗
      [
        { x: -30, y: -120 },
        { x: -5, y: -120 },
        { x: -5, y: -90 },
        { x: -45, y: -90 },
        { x: -30, y: -120 }
      ],
      [
        { x: 5, y: -120 },
        { x: 22, y: -120 },
        { x: 42, y: -90 },
        { x: 5, y: -90 },
        { x: 5, y: -120 }
      ],
      // 左车轮
      generateEllipse(-40, -60, 15, 15, 24),
      generateEllipse(-40, -60, 6, 6, 16),
      // 右车轮
      generateEllipse(40, -60, 15, 15, 24),
      generateEllipse(40, -60, 6, 6, 16),
      // 车灯前
      generateEllipse(75, -72, 4, 6, 12),
      // 尾部排气烟圈
      generateEllipse(-85, -65, 4, 4, 10),
      generateEllipse(-94, -70, 6, 5, 12)
    ]
  }
};

/**
 * 辅助函数：生成椭圆折线点集
 */
function generateEllipse(cx, cy, rx, ry, segments = 32, startDeg = 0, endDeg = 360) {
  const pts = [];
  const startRad = (startDeg * Math.PI) / 180;
  const endRad = (endDeg * Math.PI) / 180;
  const span = endRad - startRad;
  const isClosed = Math.abs(endDeg - startDeg) >= 360;

  for (let i = 0; i <= segments; i++) {
    if (i === segments && isClosed) {
      pts.push({ x: pts[0].x, y: pts[0].y });
      break;
    }
    const angle = startRad + (span * i) / segments;
    pts.push({
      x: cx + rx * Math.cos(angle),
      y: cy + ry * Math.sin(angle)
    });
  }
  return pts;
}

/**
 * 辅助函数：生成圆弧折线
 */
function generateArc(cx, cy, rx, ry, segments = 16, startDeg = 0, endDeg = 180) {
  return generateEllipse(cx, cy, rx, ry, segments, startDeg, endDeg);
}
