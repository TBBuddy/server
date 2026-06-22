export const symptomsSeed = [
  // ── Respiratory ──────────────────────────────────────────────
  {
    name: 'Batuk berkepanjangan',
    description: 'Batuk yang berlangsung lebih dari 2 minggu',
    category: 'respiratory',
    is_common_tb_symptom: true,
    is_possible_side_effect: false,
  },
  {
    name: 'Batuk berdarah',
    description: 'Batuk yang disertai darah (hemoptisis)',
    category: 'respiratory',
    is_common_tb_symptom: true,
    is_possible_side_effect: false,
  },
  {
    name: 'Sesak napas',
    description: 'Kesulitan bernapas atau napas pendek',
    category: 'respiratory',
    is_common_tb_symptom: true,
    is_possible_side_effect: false,
  },
  {
    name: 'Nyeri dada',
    description: 'Rasa sakit atau tidak nyaman di area dada',
    category: 'respiratory',
    is_common_tb_symptom: true,
    is_possible_side_effect: false,
  },

  // ── General ───────────────────────────────────────────────────
  {
    name: 'Demam',
    description: 'Suhu tubuh di atas normal, biasanya lebih dari 38°C',
    category: 'general',
    is_common_tb_symptom: true,
    is_possible_side_effect: false,
  },
  {
    name: 'Keringat malam',
    description: 'Berkeringat berlebihan saat tidur malam',
    category: 'general',
    is_common_tb_symptom: true,
    is_possible_side_effect: false,
  },
  {
    name: 'Kelelahan',
    description: 'Rasa lelah atau lemas yang tidak kunjung hilang',
    category: 'general',
    is_common_tb_symptom: true,
    is_possible_side_effect: false,
  },
  {
    name: 'Penurunan berat badan',
    description: 'Berat badan turun tanpa sebab yang jelas',
    category: 'general',
    is_common_tb_symptom: true,
    is_possible_side_effect: false,
  },
  {
    name: 'Nafsu makan menurun',
    description: 'Berkurangnya keinginan untuk makan',
    category: 'general',
    is_common_tb_symptom: true,
    is_possible_side_effect: false,
  },
  {
    name: 'Menggigil',
    description: 'Tubuh gemetar karena dingin atau demam',
    category: 'general',
    is_common_tb_symptom: false,
    is_possible_side_effect: false,
  },

  // ── Digestive (efek samping OAT) ─────────────────────────────
  {
    name: 'Mual',
    description: 'Rasa ingin muntah, sering setelah minum obat',
    category: 'digestive',
    is_common_tb_symptom: false,
    is_possible_side_effect: true,
  },
  {
    name: 'Muntah',
    description: 'Mengeluarkan isi lambung melalui mulut',
    category: 'digestive',
    is_common_tb_symptom: false,
    is_possible_side_effect: true,
  },
  {
    name: 'Nyeri perut',
    description: 'Rasa sakit di area perut',
    category: 'digestive',
    is_common_tb_symptom: false,
    is_possible_side_effect: true,
  },
  {
    name: 'Urin berwarna kemerahan',
    description:
      'Warna urin kemerahan atau oranye, efek rifampicin (tidak berbahaya)',
    category: 'digestive',
    is_common_tb_symptom: false,
    is_possible_side_effect: true,
  },

  // ── Skin ──────────────────────────────────────────────────────
  {
    name: 'Ruam kulit',
    description: 'Kemerahan atau bintik-bintik pada kulit',
    category: 'skin',
    is_common_tb_symptom: false,
    is_possible_side_effect: true,
  },
  {
    name: 'Gatal-gatal',
    description: 'Rasa gatal pada kulit',
    category: 'skin',
    is_common_tb_symptom: false,
    is_possible_side_effect: true,
  },

  // ── Neurological (efek samping OAT) ──────────────────────────
  {
    name: 'Kesemutan atau baal',
    description:
      'Rasa kesemutan atau mati rasa, terutama di tangan dan kaki (efek isoniazid)',
    category: 'neurological',
    is_common_tb_symptom: false,
    is_possible_side_effect: true,
  },
  {
    name: 'Gangguan penglihatan',
    description:
      'Penglihatan kabur atau perubahan persepsi warna (efek etambutol)',
    category: 'neurological',
    is_common_tb_symptom: false,
    is_possible_side_effect: true,
  },
  {
    name: 'Nyeri sendi',
    description: 'Rasa sakit pada persendian (efek pirazinamid)',
    category: 'neurological',
    is_common_tb_symptom: false,
    is_possible_side_effect: true,
  },
  {
    name: 'Gangguan pendengaran',
    description: 'Berkurangnya kemampuan mendengar atau tinnitus',
    category: 'neurological',
    is_common_tb_symptom: false,
    is_possible_side_effect: true,
  },
];
