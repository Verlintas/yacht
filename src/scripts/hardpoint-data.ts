/**
 * 三维硬点设置器的初始数据。
 *
 * 这里刻意复制一份 ships.ts 的 RAW 条目，避免标注工具和游戏主循环互相依赖。
 * 坐标约定与 ships.ts 完全一致：+X 右 / +Y 上 / -Z 机首，原点在包围盒中心，单位米。
 */

export interface EditorShip {
  id: string;
  name: string;
  code: string;
  role: string;
  model: string;
  length: number;
  tier?: number;
  npcOnly?: boolean;
  cockpits: Array<[number, number, number]>;
  nozzles: Array<[string, number, number, number]>;
  weapons: Array<[string, number, number, number]>;
}

export const EDITOR_SHIPS: EditorShip[] = [
  {
    "id": "thunderbolt",
    "name": "A-30 雷霆",
    "code": "A-30",
    "role": "多用途战斗机",
    "model": "thunderbolt.glb",
    "length": 25,
    "cockpits": [
      [
        0,
        0.3,
        -9.9
      ]
    ],
    "nozzles": [
      [
        "N1",
        3.3,
        -1,
        7.6
      ],
      [
        "N2",
        -3.3,
        -0.8,
        8.2
      ],
      [
        "N3S",
        2.6,
        1.6,
        6.1
      ],
      [
        "N4S",
        -2.6,
        1.7,
        6.2
      ],
      [
        "N1SF",
        2.7,
        1.7,
        -4.2
      ],
      [
        "N2SF",
        -2.8,
        1.7,
        -4.2
      ]
    ],
    "weapons": [
      [
        "W1ca-",
        -0.3,
        -3.5,
        -7.6
      ],
      [
        "W2su-",
        -9,
        -0.4,
        0.9
      ],
      [
        "W3su-",
        9.1,
        -0.5,
        0.9
      ],
      [
        "W4su--",
        -10.7,
        1.4,
        2.5
      ],
      [
        "W5su--",
        10.8,
        1.3,
        2.8
      ]
    ]
  },
  {
    "id": "f008",
    "name": "SF-F008 短剑",
    "code": "F-008",
    "role": "轻型截击机",
    "model": "f008.glb",
    "length": 22,
    "cockpits": [
      [
        0,
        0.7,
        -7.2
      ]
    ],
    "nozzles": [
      [
        "N1",
        5.4,
        0.6,
        6.4
      ],
      [
        "N2",
        -5.2,
        0.5,
        5.9
      ],
      [
        "N1SF",
        3.6,
        0.2,
        -5.2
      ],
      [
        "N2SF",
        -3.9,
        0.3,
        -5.1
      ]
    ],
    "weapons": [
      [
        "W1ca+",
        -0.9,
        -2.2,
        -8.7
      ],
      [
        "W1su+",
        4.2,
        -1.5,
        -3.3
      ],
      [
        "W2ca+",
        1,
        -2.1,
        -8.8
      ],
      [
        "W2su+",
        -4.3,
        -1.5,
        -3.3
      ]
    ]
  },
  {
    "id": "bomber",
    "name": "SF 轰炸机 CR",
    "code": "CR-3",
    "role": "重型轰炸机",
    "model": "bomber.glb",
    "length": 180,
    "cockpits": [
      [
        0,
        15.2,
        -39
      ]
    ],
    "nozzles": [
      [
        "N1",
        15.2,
        -7,
        60
      ],
      [
        "N2",
        -15,
        -7.2,
        60
      ],
      [
        "N3S",
        43.3,
        -2.5,
        31.8
      ],
      [
        "N4S",
        -43.7,
        -3.3,
        31.4
      ]
    ],
    "weapons": [
      [
        "W1P-",
        -39,
        -13.5,
        -46.7
      ],
      [
        "W2P-",
        38.6,
        -13.6,
        -46.3
      ]
    ]
  },
  {
    "id": "freighter",
    "name": "货船 MB",
    "code": "MB-4",
    "role": "货船",
    "model": "freighter.glb",
    "length": 520,
    "cockpits": [
      [
        -44.6,
        3.9,
        -232.3
      ]
    ],
    "nozzles": [
      [
        "N1",
        139.5,
        -48.7,
        196.1
      ],
      [
        "N2",
        -134.1,
        -49.4,
        195.6
      ],
      [
        "N3S",
        139.5,
        -48.5,
        -77.6
      ],
      [
        "N4S",
        -135.2,
        -44.6,
        -84.5
      ]
    ],
    "weapons": [
      [
        "W1ca-",
        -76.9,
        30.3,
        -183.7
      ]
    ]
  },
  {
    "id": "commander",
    "name": "Commander 指挥舰",
    "code": "CG-7",
    "role": "指挥舰",
    "model": "commander.glb",
    "length": 2400,
    "cockpits": [
      [
        2.7,
        170.7,
        -623.2
      ]
    ],
    "nozzles": [
      [
        "N1",
        -1.9,
        71.6,
        891.9
      ],
      [
        "N2S",
        21.7,
        21.3,
        891.9
      ],
      [
        "N3S",
        -26.7,
        24.8,
        891.9
      ]
    ],
    "weapons": [
      [
        "W1ca-Auto",
        -328.6,
        110.3,
        50.3
      ],
      [
        "W1KA",
        -106.1,
        64.3,
        -1200
      ],
      [
        "W1P-Auto",
        -430.1,
        87.9,
        -531.9
      ],
      [
        "W2ca-Auto",
        336.4,
        121.2,
        49.5
      ],
      [
        "W2KA",
        97.5,
        67.7,
        -1200
      ],
      [
        "W2P-Auto",
        428.9,
        89,
        -528.4
      ],
      [
        "W3P-Auto",
        -420.8,
        7.7,
        405.3
      ],
      [
        "W4P-Auto",
        409.5,
        14.3,
        403
      ]
    ]
  },
  {
    "id": "battleship",
    "name": "SF 战列舰",
    "code": "BB-6",
    "role": "战列舰",
    "model": "battleship.glb",
    "length": 2000,
    "cockpits": [
      [
        -1.6,
        210.1,
        -272.3
      ]
    ],
    "nozzles": [
      [
        "N1",
        307.8,
        129.6,
        955.7
      ],
      [
        "N2",
        -301.1,
        129.9,
        955.7
      ],
      [
        "N5",
        311,
        -127.7,
        955.7
      ],
      [
        "N6",
        -307.2,
        -125,
        955.7
      ],
      [
        "N3S",
        52.2,
        193.8,
        966.1
      ],
      [
        "N4S",
        -47,
        195.7,
        966.1
      ]
    ],
    "weapons": [
      [
        "W1P+++Auto",
        -272.2,
        -78.2,
        -336.5
      ],
      [
        "W2P+++Auto",
        248,
        -99.2,
        -325
      ],
      [
        "W3ca+++Auto",
        -81.4,
        229.6,
        126.1
      ],
      [
        "W4ca+++Auto",
        80.2,
        237.3,
        119.5
      ],
      [
        "W5su+++",
        -483.7,
        4.5,
        471.7
      ],
      [
        "W6su+++",
        488.6,
        0.2,
        464.8
      ],
      [
        "W7KA",
        -5.8,
        -218.6,
        -914.7
      ],
      [
        "W8ca-Auto",
        -84.6,
        213,
        223.7
      ],
      [
        "W9ca-Auto",
        -72.8,
        188.5,
        319.8
      ],
      [
        "W10ca-Auto",
        -92.5,
        206.7,
        394.4
      ],
      [
        "W11ca-Auto",
        94.1,
        200.5,
        378.2
      ],
      [
        "W12ca-Auto",
        93.4,
        202.7,
        305.8
      ],
      [
        "W13ca-Auto",
        93.6,
        202.4,
        210.6
      ],
      [
        "W14io+Auto",
        169.3,
        -121.8,
        116.5
      ],
      [
        "W15io+Auto",
        -179,
        -120.8,
        111.5
      ],
      [
        "W16io+Auto",
        -111.7,
        49.8,
        -344.6
      ],
      [
        "W17io+Auto",
        108.2,
        54.1,
        -353
      ]
    ]
  }
,
{
  "id": "iac_bomber_dk6",
  "name": "SF Bomber-DK6",
  "code": "DK-6",
  "role": "bomber",
  "model": "candidates/iac_bomber_dk6.glb",
  "length": 35,
  "tier": 2,
  "npcOnly": false,
  "cockpits": [
    [
      -0.1,
      4.5,
      -9.0
    ]
  ],
  "nozzles": [
    [
      "N1",
      -11.2,
      3.2,
      5.2
    ],
    [
      "N2",
      11.2,
      3.0,
      5.1
    ],
    [
      "N3S--",
      -0.5,
      5.7,
      2.6
    ],
    [
      "N4S--",
      -1.8,
      5.4,
      2.7
    ],
    [
      "N5S--",
      -2.8,
      4.7,
      2.6
    ],
    [
      "N6S--",
      -2.8,
      -2.8,
      2.7
    ],
    [
      "N7S--",
      -1.8,
      -3.5,
      2.8
    ],
    [
      "N8S--",
      4.4,
      2.7,
      2.6
    ],
    [
      "N9S--",
      -3.8,
      -1.9,
      2.7
    ],
    [
      "N10S--",
      -4.3,
      -0.9,
      2.6
    ],
    [
      "N11S--",
      4.7,
      1.6,
      2.7
    ],
    [
      "N12S--",
      0.6,
      5.7,
      2.7
    ],
    [
      "N13S--",
      1.8,
      5.3,
      2.6
    ],
    [
      "N14S--",
      2.8,
      4.7,
      2.5
    ],
    [
      "N15S--",
      3.8,
      3.8,
      2.7
    ],
    [
      "N16S--",
      -3.7,
      3.8,
      2.6
    ],
    [
      "N17S--",
      -4.4,
      2.8,
      2.7
    ],
    [
      "N18S--",
      -4.7,
      1.7,
      2.7
    ],
    [
      "N19S--",
      -4.6,
      0.3,
      2.6
    ],
    [
      "N20S--",
      4.7,
      0.4,
      2.6
    ],
    [
      "N21S--",
      4.4,
      -0.8,
      2.7
    ],
    [
      "N22S--",
      3.8,
      -1.9,
      2.7
    ],
    [
      "N23S--",
      2.9,
      -2.7,
      2.6
    ],
    [
      "N24S--",
      1.8,
      -3.3,
      2.6
    ],
    [
      "N25S--",
      0.6,
      -3.7,
      2.7
    ],
    [
      "N26S--",
      -0.7,
      -3.6,
      2.6
    ],
    [
      "N1SF",
      -1.8,
      2.3,
      -8.6
    ],
    [
      "N2SF",
      1.8,
      2.3,
      -8.6
    ]
  ],
  "weapons": [
    [
      "W1ca-",
      -0.4,
      3.1,
      -11.4
    ],
    [
      "W2ca-",
      0.3,
      3.2,
      -11.4
    ],
    [
      "W3su-",
      -3.4,
      2.1,
      -0.1
    ],
    [
      "W4su-",
      3.8,
      1.6,
      0.2
    ]
  ]
},
{
  "id": "iac_gladius",
  "name": "SotP Gladius-class heavy corvette",
  "code": "GL-4",
  "role": "corvette",
  "model": "candidates/iac_gladius.glb",
  "length": 90,
  "tier": 4,
  "npcOnly": false,
  "cockpits": [
    [
      0.0,
      9.2,
      15.1
    ]
  ],
  "nozzles": [
    [
      "N1",
      0.1,
      -3.4,
      42.8
    ],
    [
      "N2",
      5.0,
      0.2,
      34.4
    ],
    [
      "N3",
      -4.9,
      0.4,
      34.4
    ],
    [
      "N4SF",
      8.1,
      0.2,
      16.2
    ],
    [
      "N5SF",
      -8.1,
      0.4,
      16.8
    ]
  ],
  "weapons": [
    [
      "W1ca+++",
      0.0,
      2.2,
      -28.3
    ],
    [
      "W2su+++",
      0.0,
      -2.4,
      -28.1
    ],
    [
      "W3ca+Auto",
      5.9,
      3.7,
      19.4
    ],
    [
      "W4ca+Auto",
      5.7,
      3.6,
      23.6
    ],
    [
      "W5ca+Auto",
      -5.6,
      3.7,
      19.7
    ],
    [
      "W6ca+Auto",
      -5.8,
      3.6,
      23.6
    ],
    [
      "W7ca+Auto",
      0.0,
      -9.7,
      22.5
    ],
    [
      "W8ca+Auto",
      0.2,
      -9.5,
      27.4
    ]
  ]
},
{
  "id": "wrs_templar",
  "name": "Templar Frigate",
  "code": "TM-5",
  "role": "frigate",
  "model": "candidates/wrs_templar.glb",
  "length": 260,
  "tier": 5,
  "npcOnly": false,
  "cockpits": [
    [
      2.762,
      22.75,
      35.587
    ]
  ],
  "nozzles": [
    [
      "N1",
      -30.225,
      0.163,
      127.4
    ],
    [
      "N2",
      29.9,
      0.163,
      127.4
    ]
  ],
  "weapons": [
    [
      "W1ca+Auto",
      2.113,
      16.088,
      -92.138
    ],
    [
      "W2ca+Auto",
      -1.137,
      -29.25,
      38.837
    ],
    [
      "W3ca+++Auto",
      0.0,
      16.412,
      -35.913
    ],
    [
      "W4ca+++Auto",
      1.463,
      -15.113,
      -24.537
    ],
    [
      "W5ca+++Auto",
      0.975,
      17.55,
      88.237
    ]
  ]
},
{
  "id": "wrs_tigris",
  "name": "Yellowjackets Cruiser Tigris",
  "code": "TG-6",
  "role": "cruiser",
  "model": "candidates/wrs_tigris.glb",
  "length": 320,
  "tier": 6,
  "npcOnly": false,
  "cockpits": [
    [
      -0.343,
      38.4,
      50.971
    ]
  ],
  "nozzles": [
    [
      "N1",
      -68.0,
      -4.8,
      141.486
    ],
    [
      "N2",
      -35.543,
      -2.629,
      130.057
    ],
    [
      "N3",
      35.314,
      -3.657,
      130.057
    ],
    [
      "N4",
      67.657,
      -5.029,
      141.486
    ],
    [
      "N5++",
      -0.571,
      -2.857,
      130.857
    ],
    [
      "N6",
      -20.114,
      -3.543,
      130.057
    ],
    [
      "N7",
      19.2,
      -4.229,
      130.057
    ],
    [
      "N1SF",
      -34.286,
      -5.029,
      -128.0
    ],
    [
      "N2SF",
      34.286,
      -5.029,
      -128.0
    ]
  ],
  "weapons": [
    [
      "W1ioAuto",
      -0.229,
      33.6,
      13.371
    ],
    [
      "W2io--Auto",
      11.771,
      19.2,
      -85.829
    ],
    [
      "W3io--Auto",
      -11.886,
      19.314,
      -86.057
    ],
    [
      "W4ioAuto",
      -0.114,
      -48.571,
      2.4
    ],
    [
      "W5ca++",
      2.629,
      22.057,
      -80.343
    ],
    [
      "W6ca++",
      -2.857,
      22.057,
      -80.343
    ],
    [
      "W7ioAuto",
      -0.229,
      -39.2,
      -101.714
    ],
    [
      "W8caAuto",
      -52.914,
      -8.114,
      -62.4
    ],
    [
      "W9caAuto",
      53.029,
      -8.0,
      -62.629
    ],
    [
      "W10K---Auto",
      -35.314,
      12.457,
      132.343
    ],
    [
      "W11K---Auto",
      34.971,
      12.571,
      133.943
    ],
    [
      "W12le---Auto",
      54.971,
      14.514,
      20.686
    ],
    [
      "W13le---Auto",
      -54.4,
      14.629,
      21.257
    ]
  ]
},
{
  "id": "apa_vaulters_corvette",
  "name": "Endless Space 2 - Vaulters - Corvette",
  "code": "VA-3",
  "role": "liquid/gas drone transport",
  "model": "candidates/apa_vaulters_corvette.glb",
  "length": 90,
  "tier": 3,
  "npcOnly": true,
  "cockpits": [
    [
      -0.3,
      11.8,
      34.3
    ]
  ],
  "nozzles": [
    [
      "N1",
      10.2,
      -3.9,
      37.2
    ],
    [
      "N2",
      -10.0,
      -3.7,
      36.9
    ]
  ],
  "weapons": [
    [
      "W1ca--Auto",
      -0.6,
      -9.6,
      -27.1
    ],
    [
      "W2ca--Auto",
      -0.3,
      -8.6,
      34.4
    ],
    [
      "W3ca--Auto",
      0.3,
      -9.9,
      2.5
    ]
  ]
},
{
  "id": "apa_freighter_2f",
  "name": "SF Freighter-2F",
  "code": "F2-5",
  "role": "unmanned freighter",
  "model": "candidates/apa_freighter_2f.glb",
  "length": 220,
  "tier": 5,
  "npcOnly": true,
  "cockpits": [
    [
      1.1,
      7.7,
      -19.6
    ]
  ],
  "nozzles": [
    [
      "N1",
      -2.5,
      2.0,
      106.2
    ],
    [
      "N2",
      -1.8,
      -2.1,
      106.2
    ],
    [
      "N3",
      2.2,
      -2.0,
      106.2
    ],
    [
      "N4",
      2.0,
      2.3,
      106.2
    ]
  ],
  "weapons": []
},
{
  "id": "ort_phalanx",
  "name": "Phalanx Corvette",
  "code": "PH-3",
  "role": "corvette",
  "model": "candidates/ort_phalanx.glb",
  "length": 80,
  "tier": 3,
  "npcOnly": false,
  "cockpits": [
    [
      -0.3,
      3.5,
      -21.1
    ]
  ],
  "nozzles": [
    [
      "N1",
      -6.5,
      -1.6,
      39.2
    ],
    [
      "N2",
      6.1,
      -1.6,
      39.2
    ],
    [
      "N1SF",
      -9.4,
      -0.8,
      -0.9
    ],
    [
      "N2SF",
      9.4,
      -0.5,
      -1.0
    ]
  ],
  "weapons": [
    [
      "W1ca-",
      -3.3,
      0.0,
      -30.4
    ],
    [
      "W2ca-",
      3.3,
      0.0,
      -30.4
    ],
    [
      "W3su-",
      -7.4,
      -5.1,
      11.3
    ],
    [
      "W4su-",
      6.8,
      -5.3,
      11.2
    ],
    [
      "W5ca+",
      9.8,
      4.5,
      1.0
    ],
    [
      "W6ca+",
      6.8,
      1.9,
      8.0
    ],
    [
      "W7ca+",
      -6.7,
      4.4,
      1.0
    ],
    [
      "W8ca+",
      -13.6,
      -0.8,
      16.5
    ]
  ]
},
{
  "id": "ort_rhodes",
  "name": "Rhodes Battlecruiser",
  "code": "RH-7",
  "role": "battlecruiser",
  "model": "candidates/ort_rhodes.glb",
  "length": 600,
  "tier": 7,
  "npcOnly": false,
  "cockpits": [
    [
      0.0,
      32.057,
      -177.6
    ],
    [
      -0.857,
      50.914,
      34.114
    ]
  ],
  "nozzles": [
    [
      "N1",
      0.514,
      -10.8,
      295.543
    ],
    [
      "N2S",
      -14.4,
      -6.514,
      295.543
    ],
    [
      "N3S",
      14.571,
      -6.686,
      295.543
    ],
    [
      "N4S",
      0.171,
      -34.114,
      254.057
    ],
    [
      "N5S--",
      -4.114,
      14.229,
      255.086
    ],
    [
      "N6S--",
      4.286,
      14.571,
      255.086
    ],
    [
      "N7S--",
      -3.257,
      9.6,
      255.086
    ],
    [
      "N8S--",
      4.286,
      9.429,
      255.086
    ]
  ],
  "weapons": [
    [
      "W1KAuto",
      -1.886,
      -1.2,
      -244.457
    ],
    [
      "W2ca+++Auto",
      -10.8,
      40.8,
      -102.0
    ],
    [
      "W3K--Auto",
      -0.857,
      -41.657,
      -129.429
    ],
    [
      "W4ca+Auto",
      -58.971,
      18.514,
      65.486
    ],
    [
      "W5ca+Auto",
      -51.771,
      16.114,
      116.571
    ],
    [
      "W6ca+Auto",
      54.857,
      16.629,
      121.543
    ],
    [
      "W7ca+Auto",
      56.057,
      18.514,
      65.829
    ],
    [
      "W8su++",
      15.771,
      -1.371,
      -164.743
    ],
    [
      "W9su++",
      -16.286,
      -0.171,
      -162.514
    ]
  ]
},
{
  "id": "rta_shark",
  "name": "SSF-21 Shark",
  "code": "SH-3",
  "role": "interceptor",
  "model": "candidates/rta_shark.glb",
  "length": 28,
  "tier": 3,
  "npcOnly": false,
  "cockpits": [
    [
      0.0,
      2.6,
      -0.8
    ]
  ],
  "nozzles": [
    [
      "N1",
      -3.0,
      1.0,
      12.2
    ],
    [
      "N2",
      3.0,
      1.0,
      12.2
    ],
    [
      "N3",
      0.0,
      0.6,
      9.6
    ]
  ],
  "weapons": [
    [
      "W1le+",
      9.0,
      -1.2,
      0.1
    ],
    [
      "W2le+",
      4.8,
      1.8,
      0.9
    ],
    [
      "W3su-",
      -5.1,
      -1.3,
      -11.2
    ],
    [
      "W4su-",
      5.0,
      -1.3,
      -11.2
    ],
    [
      "W5le+",
      -4.7,
      1.6,
      0.5
    ],
    [
      "W6le+",
      -8.8,
      -1.5,
      0.1
    ],
    [
      "W7le-Auto",
      0.0,
      0.1,
      -2.9
    ],
    [
      "W8P--",
      1.9,
      1.9,
      -3.2
    ]
  ]
},
{
  "id": "rta_archon",
  "name": "Jericho destroyer Archon",
  "code": "AR-10",
  "role": "destroyer",
  "model": "candidates/rta_archon.glb",
  "length": 1200,
  "tier": 10,
  "npcOnly": false,
  "cockpits": [
    [
      7.627,
      22.853,
      -477.813
    ]
  ],
  "nozzles": [
    [
      "N1",
      -21.84,
      42.453,
      609.333
    ],
    [
      "N2",
      -20.427,
      -29.627,
      609.333
    ],
    [
      "N3",
      24.96,
      42.32,
      609.333
    ],
    [
      "N4",
      26.373,
      -29.76,
      609.333
    ],
    [
      "N1SF",
      -70.72,
      -7.707,
      -480.0
    ],
    [
      "N2SF",
      70.72,
      -7.707,
      -480.0
    ]
  ],
  "weapons": [
    [
      "W1ca-",
      -35.36,
      0.0,
      -456.0
    ],
    [
      "W2ca-",
      35.36,
      0.0,
      -456.0
    ],
    [
      "W3su-",
      -123.76,
      0.0,
      -180.0
    ],
    [
      "W4su-",
      123.76,
      0.0,
      -180.0
    ],
    [
      "W5K-",
      0.0,
      95.493,
      0.0
    ],
    [
      "W6K-",
      0.0,
      -95.493,
      0.0
    ]
  ]
},
{
  "id": "mvb_hisshos",
  "name": "Endless Space 2 - Hisshos - Corvette",
  "code": "HS-2",
  "role": "drone",
  "model": "candidates/mvb_hisshos.glb",
  "length": 25,
  "tier": 2,
  "npcOnly": true,
  "cockpits": [
    [
      0.1,
      1.35,
      -2.775
    ]
  ],
  "nozzles": [
    [
      "N1S",
      0.125,
      -0.7,
      5.975
    ]
  ],
  "weapons": [
    [
      "W1su++",
      -0.05,
      -1.2,
      -3.25
    ]
  ]
},
{
  "id": "mvb_oss",
  "name": "Covenant OSS-class battlecarrier",
  "code": "OS-8",
  "role": "battlecarrier",
  "model": "candidates/mvb_oss.glb",
  "length": 900,
  "tier": 8,
  "npcOnly": true,
  "cockpits": [
    [
      -0.3,
      4.8,
      -430.6
    ]
  ],
  "nozzles": [
    [
      "N1",
      -2.1,
      -45.9,
      301.0
    ],
    [
      "N2",
      -31.3,
      -33.5,
      279.9
    ],
    [
      "N3",
      32.1,
      -33.8,
      279.3
    ],
    [
      "N4F",
      90.5,
      -34.8,
      -221.5
    ],
    [
      "N5F",
      -93.2,
      -37.3,
      -221.0
    ]
  ],
  "weapons": [
    [
      "W1leAuto",
      190.3,
      18.8,
      -98.3
    ],
    [
      "W2leAuto",
      -189.3,
      18.9,
      -98.0
    ],
    [
      "W3leAuto",
      -233.7,
      -34.0,
      127.1
    ],
    [
      "W4leAuto",
      233.5,
      -33.1,
      131.8
    ]
  ]
}
];
