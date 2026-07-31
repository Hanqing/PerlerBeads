# 拼豆设备档案与实现约束

更新日期：2026-07-31

## 实物工作流

从本目录照片可归纳出一套完整工作台：

1. 平板、屏幕或打印图纸负责逐格参考。
2. 方形底板承载拼豆；大作品由多块底板拼接。
3. 豆子按品牌色号分罐储存，库存管理单位为“颗”，采购单位为“袋”。
4. 镊子等工具负责摆放，热压机或熨斗完成熔合。
5. 成品可装入展示框或灯框。

因此，BeadGrid 的核心输出应包含：设备规格、作品物理尺寸、板号、四边全局坐标、逐格色号、每色数量、库存缺口和校准尺。

## 已核验的官方规格

| 系统 | 豆径 | 官方大方板 | 理论拼图区 | 连接 | 证据 |
| --- | ---: | ---: | ---: | --- | --- |
| Hama Midi | 5 mm | 841 钉，即 29 × 29 | 145 × 145 mm | 是 | [豆子规格](https://hama.dk/en/pages/meet-our-different-beads) · [底板](https://hama.dk/en/products/midi-pegboard-large-square) |
| Hama Mini | 2.5 mm | 3,249 钉，即 57 × 57 | 142.5 × 142.5 mm | 官方页未注明 | [豆子规格](https://hama.dk/en/pages/meet-our-different-beads) · [底板](https://hama.dk/en/products/mini-pegboard-large-square) |
| Hama Maxi | 10 mm | 256 钉，即 16 × 16 | 160 × 160 mm | 官方页未注明 | [豆子规格](https://hama.dk/en/pages/meet-our-different-beads) · [底板](https://hama.dk/en/products/maxi-pegboard-large-square) |
| Perler Standard | 约 5 mm 系统 | 透明大方板约 5.7 英寸 | 约 145 mm | 是 | [官方产品页](https://perler.com/products/large-clear-square-pegboards-4-ct) |
| Artkal Midi | 5 mm | 透明方板约 14.5 × 14.5 cm | 约 145 mm | 是 | [官方底板页](https://www.artkalbead.com/pegboard/) |

Perler 预设采用行业通用的 29 × 29 施工网格，但官方产品页主要给出 5.7 英寸外形和互锁信息。不同批次或兼容板存在公差，必须以手中底板与校准尺叠合为准。

## 热压与熨烫边界

- Hama 的官方熨烫说明按熨斗织物档位给出相对建议：Mini 对应羊毛、Midi 对应棉、Maxi 对应亚麻，并要求先做小样、轻柔画圈、由成人操作、冷却时压平。它不能直接换算成照片热压机的统一摄氏温度。[Hama 官方熨烫说明 PDF](https://www.hama.dk/media/101343/stryge-hollandsk.pdf)
- Perler 的单个项目指南常给出每面约 10–20 秒的项目级操作，并强调熨烫纸与成人操作；这也不是对所有品牌和设备通用的硬编码参数。[Perler 官方项目示例](https://perler.com/blogs/projects/3d-picnic-basket)
- 大项目可采用胶带转移后分区熔合，减少大型底板受热变形风险；使用前仍应遵循所用品牌与设备说明。[Perler 官方 Tape Method](https://perler.com/content/project_guides/perler-project-guide_the-tape-method-for-fusing-large-projects.pdf)

软件当前只输出设备标识、尺寸和校准信息，不自动控制热压设备，也不替用户选择温度。
