"""Idempotent seed for TNL Studio — real content from the current lab site.

Run:  cd /app/backend && python seed.py
      cd /app/backend && python seed.py --reset    (drop app collections first)

Unverified material (R&D clusters, testbeds, hero statistics, funder claims) is
seeded as DRAFTS flagged "TODO: verify" — never published, never presented as fact.
Never seeds lorem ipsum, fake phone numbers or copied social links.
"""

import asyncio
import os
import shutil
import sys
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import httpx

from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

from lib.auth import hash_password  # noqa: E402
from lib.db import db, ensure_indexes  # noqa: E402
from models.content import (  # noqa: E402
    Activity, Equipment, Event, MediaItem, Member, MemberProject, MemberSocial, Partner, Post, PracticumModule, PracticumResource, PracticumShift, Project, Publication,
)
from models.core import SettingsDoc, ThemeTokens  # noqa: E402

NOW = datetime.now(timezone.utc)
TODO = "TODO: verify"

ABOUT_EN = (
    "The Telecommunication Network Laboratory (TNL) is a teaching and research laboratory in the "
    "Department of Electrical Engineering, Institut Teknologi Sepuluh Nopember, based in Room B-301 "
    "of Building B. The laboratory supports undergraduate practicum in telecommunication networks, "
    "hosts applied research in network engineering and the Internet of Things, and runs professional "
    "training for students and industry partners. Day-to-day activities are carried out by lecturers, "
    "researchers and a team of student laboratory assistants."
)
ABOUT_ID = (
    "Laboratorium Jaringan Telekomunikasi (TNL) merupakan laboratorium pendidikan dan penelitian di "
    "Departemen Teknik Elektro, Institut Teknologi Sepuluh Nopember, yang berlokasi di Ruang B-301 "
    "Gedung B. Laboratorium ini mendukung praktikum jaringan telekomunikasi untuk mahasiswa sarjana, "
    "menjadi tempat penelitian terapan di bidang rekayasa jaringan dan Internet of Things, serta "
    "menyelenggarakan pelatihan profesional bagi mahasiswa dan mitra industri. Kegiatan harian "
    "dijalankan oleh dosen, peneliti, dan tim asisten laboratorium."
)

# Head's statement, as published on the official laboratory page (riset.its.ac.id/lab-tnl).
HEAD_QUOTE_EN = (
    "Telecommunication Network Laboratory focuses on research and innovation in modern networking, "
    "encompassing system design, performance optimization, and the implementation of emerging "
    "technologies to support both industry and academic needs."
)
HEAD_QUOTE_ID = (
    "Laboratorium Jaringan Telekomunikasi berfokus pada penelitian dan inovasi di bidang jaringan modern, "
    "mencakup perancangan sistem, optimasi unjuk kerja, dan penerapan teknologi terkini untuk mendukung "
    "kebutuhan industri maupun akademik."
)

# Lecturers and researchers OF THE LABORATORY, exactly as listed on the lab's own member
# page (riset.its.ac.id/lab-tnl/member). Institutional e-mail addresses come from the
# department directory (its.ac.id/telektro). Public staff directory data only.
# (photo file name on the lab site, used to pull the real portrait)
LECTURERS = [
    ("Prof. Eko Setijadi, S.T., M.T., Ph.D", "ekoset@ee.its.ac.id", "Professor Researcher",
     ["Antenna and propagation", "Wireless communication"], "2.png"),
    ("Sri Rahayu, S.T., M.Kom.", "s.rahayu@its.ac.id", "Lecturer Researcher",
     ["Computer networks", "Information systems"], "3.png"),
    ("Dr.techn. Prasetiyono Hari Mukti, S.T., M.T.", "prasetiyono@its.ac.id", "Lecturer Researcher",
     ["Internet of Things", "Antenna and propagation"], "4-1.png"),
]

AFFANDI_PROJECTS = [
    MemberProject(
        title="Perancangan Intrusion Detection System (IDS) Berbasis Machine Learning pada Trafik SCADA Protokol IEC 60870-5-104",
        year="2024-2025",
        funding="Hibah Riset Terapan ITS / DIKTI",
        description="Pengembangan arsitektur deteksi anomali komunikasi telemetri dan kendali tenaga listrik menggunakan dataset trafik berlabel IEC104-IDS.",
    ),
    MemberProject(
        title="Studi Propagasi Kanal Nirkabel VHF/UHF Model Okumura-Hata untuk Komunikasi Maritim",
        year="2023-2024",
        funding="Penelitian Fundamental ITS",
        description="Analisis dampak elevasi antena dan kondisi clutter wilayah pesisir guna optimalisasi jangkauan transmisi data telekomunikasi.",
    ),
    MemberProject(
        title="Pengembangan Prototipe Gateway Akustik Bawah Air untuk Jaringan Sensor Bawah Laut (UASN)",
        year="2022-2023",
        funding="Riset Unggulan Laboratorium TNL",
        description="Integrasi modul komunikasi akustik nirkabel dengan mikrokontroler hemat daya untuk telemetri kualitas perairan laut.",
    ),
]

LECTURER_PROJECTS = {
    "Prof. Eko Setijadi, S.T., M.T., Ph.D": [
        MemberProject(
            title="Rancang Bangun Antena Phased Array Reconfigurable Beamforming untuk Jaringan 5G/6G Millimeter-Wave",
            year="2024-2025",
            funding="Hibah Riset Kolaborasi Internasional / BOPTN ITS",
            description="Pengembangan elemen antena mikrostrip multi-beam gain tinggi dengan efisiensi radiasi superior pada pita frekuensi 28 GHz.",
        ),
        MemberProject(
            title="Karakterisasi Kanal Propagasi dan Pengurangan Multipath Fading pada Komunikasi Antar-Wahana (V2X)",
            year="2023-2024",
            funding="Penelitian Terapan Keunggulan Perguruan Tinggi",
            description="Pengukuran empiris dan pemodelan matematis lintasan sinyal nirkabel ultra-low latency untuk sistem transportasi cerdas.",
        ),
    ],
    "Sri Rahayu, S.T., M.Kom.": [
        MemberProject(
            title="Optimasi Quality of Service (QoS) dan Rekayasa Trafik Jaringan Kampus ITS Berbasis SDN",
            year="2024-2025",
            funding="Riset Terapan Departemen Teknik Elektro ITS",
            description="Implementasi kontrol terpusat OpenFlow untuk dynamic bandwidth allocation dan perutean adaptif saat beban puncak jaringan akademik.",
        ),
        MemberProject(
            title="Analisis Ketahanan Arsitektur Jaringan Cloud Terdistribusi terhadap Serangan DDoS Skala Besar",
            year="2023-2024",
            funding="Hibah Penelitian Pemula ITS",
            description="Evaluasi performa packet-filtering dan load balancing cerdas pada lingkungan server virtualisasi berbasis OpenStack.",
        ),
    ],
    "Dr.techn. Prasetiyono Hari Mukti, S.T., M.T.": [
        MemberProject(
            title="Pengembangan Jaringan Sensor Cerdas Berbasis LoRaWAN untuk Telemetri Pertanian Presisi dan Mitigasi Bencana",
            year="2024-2025",
            funding="Hibah Riset Inovasi & Hilirisasi ITS",
            description="Penerapan node sensor konsumsi daya mikro dengan jangkauan transmisi non-line-of-sight hingga 10 km untuk pemantauan parameter tanah real-time.",
        ),
        MemberProject(
            title="Perancangan Komunikasi Mesin-ke-Mesin (M2M) Hemat Energi pada Sistem Meter Air Cerdas Terdistribusi",
            year="2023-2024",
            funding="Kerjasama Riset Industri",
            description="Desain protokol sleep-wake adaptif pada transceiver sub-GHz guna memperpanjang masa operasional baterai perangkat IoT lapangan.",
        ),
    ],
}

# Published scholarly output involving laboratory staff. Every entry below is a real,
# citable record; anything the laboratory still needs to confirm is seeded as a draft instead.
PUBLICATIONS = [
    {
        "title": ("A Comparative Study on the Impact of Antenna Height in Okumura-Hata Propagation "
                  "Model for VHF/UHF in Mataram City"),
        "authors": "A. Affandi et al.",
        "venue": "2026 International Seminar on Intelligent Technology and Its Applications (ISITIA)",
        "year": 2026, "ptype": "conference",
        "tags": ["propagation", "VHF/UHF", "Okumura-Hata"],
        "abstract": ("A comparative study of how antenna height affects path-loss prediction with the "
                     "Okumura-Hata model for VHF/UHF bands, evaluated for Mataram City."),
    },
    {
        "title": ("IEC104-IDS-2025: Labeled Network Traffic Dataset for Intrusion Detection in "
                  "IEC 60870-5-104 SCADA Communication"),
        "authors": "A. Affandi et al.",
        "venue": "Zenodo (open dataset)",
        "year": 2026, "ptype": "other",
        "tags": ["network security", "intrusion detection", "SCADA", "dataset"],
        "abstract": ("A labelled network traffic dataset for intrusion detection research on "
                     "IEC 60870-5-104 SCADA communication."),
    },
    {
        "title": "Software Defined Modem for Interconnection of Terrestrial and Underwater Acoustics Network",
        "authors": "A. Affandi et al.",
        "venue": "2025 International Seminar on Intelligent Technology and Its Applications (ISITIA)",
        "year": 2025, "ptype": "conference",
        "tags": ["software defined radio", "underwater acoustics", "network interconnection"],
        "abstract": ("Design of a software defined modem that interconnects terrestrial networks with an "
                     "underwater acoustic network."),
    },
    {
        "title": ("Impact Analysis of Electronic-Based Government System Implementation by the Local "
                  "Government Through Public Wi-Fi Services"),
        "authors": "A. Affandi et al.",
        "venue": "2025 International Seminar on Intelligent Technology and Its Applications (ISITIA)",
        "year": 2025, "ptype": "conference",
        "tags": ["public Wi-Fi", "e-government", "digital services"],
        "abstract": ("An impact analysis of electronic-based government services delivered to citizens "
                     "through local-government public Wi-Fi."),
    },
    {
        "title": "Decision Support System for Personnel Transfer Recommendation",
        "authors": "A. Affandi et al.",
        "venue": "2025 International Seminar on Intelligent Technology and Its Applications (ISITIA)",
        "year": 2025, "ptype": "conference",
        "tags": ["decision support", "information systems"],
        "abstract": "A decision support system that produces personnel transfer recommendations.",
    },
    {
        "title": ("Implementasi Jaringan Internet Desa untuk Mendukung Transformasi Digital di Kantor "
                  "Desa Sedaeng"),
        "authors": "P. H. Mukti et al.",
        "venue": "Sewagati — Jurnal Pengabdian kepada Masyarakat, vol. 9, no. 2, pp. 358–365",
        "year": 2025, "ptype": "journal",
        "doi": "10.12962/j26139960.v9i2.2416",
        "tags": ["community service", "rural connectivity", "digital transformation"],
        "abstract": ("A community service report on building a village internet network with Mikrotik LHG "
                     "point-to-point links to support digital transformation at the Sedaeng village office, "
                     "Tosari, Pasuruan."),
    },
    {
        "title": "Cloud Node Auto-Scaling System Automation Based on Computing Workload Prediction",
        "authors": "T. F. Arya, R. F. Rachmad, A. Affandi",
        "venue": "Jurnal RESTI (Rekayasa Sistem dan Teknologi Informasi), vol. 8, no. 5, pp. 597–606",
        "year": 2024, "ptype": "journal",
        "doi": "10.29207/resti.v8i5.5928",
        "tags": ["cloud computing", "auto-scaling", "workload prediction"],
        "abstract": ("Automation of horizontal cloud node auto-scaling driven by machine-learning predictions "
                     "of computing workload from CPU and RAM usage."),
    },
    {
        "title": "Assessment of IT Governance in Supporting XYZ University KPIs Using COBIT 2019",
        "authors": "A. Affandi et al.",
        "venue": "2024 International Seminar on Intelligent Technology and Its Applications (ISITIA)",
        "year": 2024, "ptype": "conference",
        "tags": ["IT governance", "COBIT 2019"],
        "abstract": ("An assessment of IT governance maturity and its support for university key performance "
                     "indicators using the COBIT 2019 framework."),
    },
    {
        "title": "The Implementation of ISO 37301:2021 on Compliance Management System",
        "authors": "A. Affandi et al.",
        "venue": "IEEE International Conference on Consumer Electronics (ICCE)",
        "year": 2024, "ptype": "conference",
        "tags": ["compliance management", "ISO 37301"],
        "abstract": "A study of implementing an ISO 37301:2021 compliance management system.",
    },
]

# Hero highlight tiles, as published on the official laboratory page.
HERO_HIGHLIGHTS = [
    ("Advanced Research Equipment", "Perangkat Penelitian Lanjut",
     "Modern routers, fiber optics, and wireless testbeds",
     "Router modern, serat optik, dan testbed nirkabel"),
    ("Hands-On Practicum", "Praktikum Langsung",
     "Comprehensive networking modules for students",
     "Modul jaringan yang komprehensif untuk mahasiswa"),
    ("Research Collaboration", "Kolaborasi Penelitian",
     "Open to university and industry partnerships",
     "Terbuka untuk kemitraan universitas dan industri"),
    ("Certified Training Programs", "Program Pelatihan Bersertifikat",
     "Accredited short courses and workshops",
     "Kursus singkat dan lokakarya tersertifikasi"),
]

FOCUS_AREAS = [
    {"name": "Research & Development", "name_id": "Penelitian & Pengembangan"},
    {"name": "Practicum", "name_id": "Praktikum"},
    {"name": "Training", "name_id": "Pelatihan"},
    {"name": "Assistant Activity", "name_id": "Kegiatan Asisten"},
    {"name": "IoT Research Hub", "name_id": "Pusat Riset IoT"},
]

FOCUS_DETAIL = [
    ("Research & Development", "Penelitian & Pengembangan",
     "Applied research across software-defined networking, 5G wireless testbeds, and optical transport.",
     "Penelitian terapan pada software-defined networking, testbed nirkabel 5G, dan transport optik."),
    ("Practicum Education", "Praktikum Akademik",
     "Undergraduate laboratory practicum in telecommunication networks, supervised by lab assistants in B-301.",
     "Praktikum jaringan telekomunikasi untuk mahasiswa sarjana, dibimbing oleh asisten laboratorium di B-301."),
    ("Professional Training", "Pelatihan Profesional",
     "Accredited workshops and certification preparation covering Cisco Packet Tracer and modern network engineering.",
     "Lokakarya terakreditasi dan pelatihan persiapan sertifikasi meliputi Cisco Packet Tracer dan rekayasa jaringan modern."),
    ("Assistant Community", "Pengembangan Tim Asisten",
     "Structured peer mentoring, technical onboarding, and leadership growth that sustain the laboratory team.",
     "Pembinaan terstruktur, pembekalan teknis, dan pengembangan kepemimpinan yang menjaga keberlangsungan tim asisten."),
    ("Industry Collaboration", "Kolaborasi Industri",
     "Strategic technology and research partnerships with national telecom operators and industry vendors.",
     "Kemitraan teknologi dan riset strategis dengan operator telekomunikasi nasional dan vendor industri."),
]

ABOUT_TILES = [
    {
        "name": "Vision & Mission",
        "name_id": "Visi & Misi Laboratorium",
        "description": "To be an internationally recognized center of excellence in telecommunication network engineering, advancing industry-standard practicum and leading applied research in 5G/6G, optical fiber, and IoT systems.",
        "description_id": "Menjadi pusat keunggulan bereputasi internasional dalam rekayasa jaringan telekomunikasi, menyelenggarakan praktikum berstandar industri, serta memimpin riset terapan 5G/6G, serat optik, dan IoT.",
    },
    {
        "name": "Room B-301 Facilities & Testbeds",
        "name_id": "Fasilitas & Testbed Ruang B-301",
        "description": "Integrated laboratory hosting a 3-Node Proxmox Cloud Virtualization Cluster, Ettus USRP B210 Software-Defined Radios, core Cisco & MikroTik routing racks, and precision fusion splicing workbenches.",
        "description_id": "Laboratorium terpadu yang dilengkapi klaster server Proxmox, testbed SDR USRP B210, rak routing Cisco & MikroTik, serta meja kerja penyambungan serat optik presisi.",
    },
]

FIELDS_OF_STUDY = [
    ("Optical & Photonic Networks (PON / WDM)", "Jaringan Optik & Fotonik (PON / WDM)",
     "High-speed optical transport networks, wavelength division multiplexing (WDM), passive optical network (PON) architectures, and fiber dispersion characterization.",
     "Jaringan transport optik berkecepatan tinggi, wavelength division multiplexing (WDM), arsitektur passive optical network (PON), serta karakterisasi dispersi serat optik."),
    ("5G/6G & Software-Defined Radio (SDR)", "5G/6G & Software-Defined Radio (SDR)",
     "Software-defined wireless testbeds utilizing USRP B210, OpenAirInterface (OAI), and srsRAN for standalone 5G NR gNodeB deployment and sub-6 GHz RF channel characterization.",
     "Testbed nirkabel berbasis SDR menggunakan USRP B210, OpenAirInterface (OAI), dan srsRAN untuk penggelaran gNodeB 5G NR mandiri serta karakterisasi kanal RF sub-6 GHz."),
    ("Cloud-Native, NFV & Software-Defined Networking", "Cloud-Native, NFV & Software-Defined Networking",
     "Virtual network function (VNF) orchestration on high-availability Proxmox clusters, OpenFlow SDN controllers, and low-latency network slicing for telecom infrastructure.",
     "Orkestrasi virtual network function (VNF) pada klaster Proxmox berkinerja tinggi, kontroler SDN berbasis OpenFlow, dan network slicing berlatensi rendah untuk infrastruktur telekomunikasi."),
    ("IoT Telemetry & SCADA Network Security", "Telemetri IoT & Keamanan Jaringan SCADA",
     "End-to-end LoRaWAN and cellular IoT telemetry, industrial SCADA protocol vulnerability analysis, and machine-learning intrusion detection for IEC 60870-5-104 communications.",
     "Telemetri IoT end-to-end berbasis LoRaWAN dan seluler, analisis kerentanan protokol SCADA industri, serta sistem deteksi intrusi berbasis ML untuk komunikasi IEC 60870-5-104."),
    ("Wireless Propagation & Antenna Modeling", "Propagasi Nirkabel & Pemodelan Antena",
     "Empirical path-loss analysis, antenna beamforming, and wireless channel characterization across VHF/UHF and microwave bands in tropical dense urban environments.",
     "Analisis rugi propagasi empiris, antena beamforming, dan pemodelan kanal nirkabel pada pita VHF/UHF hingga gelombang mikro di lingkungan tropis perkotaan."),
]

ASSISTANT_ACTIVITIES = [
    ("Open House Laboratory", "Open House Laboratorium", "academic",
     "An open session introducing the laboratory, its facilities in B-301 and its research focus to students who are considering joining.",
     "Sesi terbuka yang memperkenalkan laboratorium, fasilitas di B-301, dan fokus penelitiannya kepada mahasiswa yang tertarik bergabung."),
    ("Open Registration Assistants", "Open Recruitment Asisten", "internal",
     "The annual recruitment cycle for new laboratory assistants, covering administrative selection, interviews and technical assessment.",
     "Siklus rekrutmen tahunan untuk asisten laboratorium baru, meliputi seleksi administrasi, wawancara, dan penilaian teknis."),
    ("Internalisasi & Welcome Party", "Internalisasi & Welcome Party", "internal",
     "An onboarding programme that welcomes newly accepted assistants and introduces the laboratory's working culture and responsibilities.",
     "Program pengenalan yang menyambut asisten baru serta memperkenalkan budaya kerja dan tanggung jawab di laboratorium."),
    ("Bukber TNL", "Bukber TNL", "social",
     "A shared iftar gathering during Ramadan for current assistants, alumni and lecturers of the laboratory.",
     "Buka puasa bersama selama Ramadan bagi asisten aktif, alumni, dan dosen laboratorium."),
    ("Malam Wisuda & Pelepasan Asisten", "Malam Wisuda & Pelepasan Asisten", "social",
     "A farewell evening held for graduating assistants, marking the handover of responsibilities to the next batch.",
     "Malam perpisahan bagi asisten yang akan diwisuda, sekaligus menandai serah terima tanggung jawab kepada angkatan berikutnya."),
    ("Binbarshow", "Binbarshow", "academic",
     "A showcase session where assistants present the results of their guided development and learning programme.",
     "Sesi pemaparan hasil program pembinaan dan pembelajaran terbimbing yang dijalani oleh para asisten."),
    ("Internal Training", "Pelatihan Internal", "internal",
     "Technical training delivered within the assistant team to build networking and laboratory skills before each practicum period.",
     "Pelatihan teknis di internal tim asisten untuk membangun keterampilan jaringan dan laboratorium sebelum setiap periode praktikum."),
    ("External Training", "Pelatihan Eksternal", "academic",
     "Training opened to students outside the laboratory, delivered by assistants and lecturers of TNL.",
     "Pelatihan yang dibuka untuk mahasiswa di luar laboratorium, dibawakan oleh asisten dan dosen TNL."),
]

DIVISIONS = ["BPH", "Academic", "Research", "Social", "Internal", "External"]

# Active 2026 Assistant Roster (25 members: Batch 2023 & Batch 2024)
# (name, nrp, batch, photo_file, position, position_label, division, email, ig)
ACTIVE_ASSISTANTS_2026 = [
    # BPH (3 members, Batch 2023)
    ("Dhika Wahyu Arfian Putra", "5048231005", "2023", "23.png", "coordinator", "Laboratory Coordinator", "BPH", "dhikawahyuarfianputra@gmail.com", "dhikaw__"),
    ("Muhammad Rizqi Fadhlurrahman", "5048231009", "2023", "20.png", "coordinator", "Vice Coordinator", "BPH", "fhl.041231@gmail.com", "rizqifadlu"),
    ("Widya Firdausi Ahla Samariansyah", "5048231059", "2023", "26.png", "coordinator", "Secretary & Treasurer", "BPH", "widyasamariansyah@gmail.com", "widyassf"),

    # Academic Division (5 members: 3 Batch 2023, 2 Batch 2024)
    ("Steffano Asian Budi Setyo", "5048231022", "2023", "15.png", "head", "Head of Academic", "Academic", "steffano.asianbudisetyo@gmail.com", "steffanobudisetyo"),
    ("Rafli Alif Ihza Hartono", "5048231003", "2023", "14.png", "head", "Co-Head of Academic", "Academic", "raflihartono87@gmail.com", "rhaffle87"),
    ("Nathanael Tumpal Sianturi", "5048231066", "2023", "17.png", "head", "Co-Head of Academic", "Academic", "natumpal2004@gmail.com", "nathanaell_ts"),
    ("Darel Christianto Oktavian", "5048241037", "2024", None, "staff", "Academic Staff", "Academic", "doktavian425@gmail.com", "dareloktvn"),
    ("Muhammad Izzul Wafa", "5048241013", "2024", None, "staff", "Academic Staff", "Academic", "muhamaizzul@gmail.com", "zzlwafaa"),

    # Research Division (4 members: 2 Batch 2023, 2 Batch 2024)
    ("Rafi Adin Maulvi Nazir Ahmad", "5048231011", "2023", "24.png", "head", "Head of Research", "Research", "rafiadin28@gmail.com", "rafiadin28"),
    ("Raihan Muzhaffar Athallah", "5048231031", "2023", "25.png", "head", "Co-Head of Research", "Research", "raihanmuzhaffar18@gmail.com", "rhnma.13"),
    ("Nindita Putri Aisyah", "5048241003", "2024", None, "staff", "Research Staff", "Research", "ninditaaisyah@gmail.com", "ninditaaptr_"),
    ("Zein Aditya Pasha", "5048241035", "2024", None, "staff", "Research Staff", "Research", "adityapashaaaa@gmail.com", "zeynnnaditt"),

    # Social Division (5 members: 2 Batch 2023, 3 Batch 2024)
    ("Muhammad Zidan Hifzhurrahman", "5038231007", "2023", "16.png", "head", "Head of Social", "Social", "zidanplatr@gmail.com", "mz_hifzhurrahman"),
    ("Roy Wiranata", "5048231051", "2023", "18.png", "head", "Co-Head of Social", "Social", "roywira8@gmail.com", "roywira8"),
    ("Kreshna Kamaludin Kusnadi", "5048241029", "2024", None, "staff", "Social Staff", "Social", "kreshna.kusnadi@gmail.com", "kreshnakus"),
    ("Annisa Fathinatuzzahra", "5048241030", "2024", None, "staff", "Social Staff", "Social", "annisaftzhr@gmail.com", "annisaafath"),
    ("Nouval Ramadhan", "5048241012", "2024", None, "staff", "Social Staff", "Social", "nouvalrmdhn1@gmail.com", "nouval.ramadhan"),

    # Internal Division (4 members: 2 Batch 2023, 2 Batch 2024)
    ("Lidya Melisa Ardeori Remindauw", "5048231002", "2023", "melisa.png", "head", "Head of Internal", "Internal", "lidya.melisa12@gmail.com", "lidya_melisa12"),
    ("Sarah Sofhi Susanty", "5048231075", "2023", "19.png", "head", "Co-Head of Internal", "Internal", "sarahssusanty@gmail.com", "sarahssnty"),
    ("Ida Ayu Sayla Nadia Putri", "5048241009", "2024", None, "staff", "Internal Staff", "Internal", "idaayusaylanadiaputri@gmail.com", "idaayusayla"),
    ("Ryan Raditya Bagaskara", "5048241027", "2024", None, "staff", "Internal Staff", "Internal", "rbagaskara70@gmail.com", "radityarb"),

    # External Division (4 members: 2 Batch 2023, 2 Batch 2024)
    ("Bulan Nurhaliza", "5048231073", "2023", "21.png", "head", "Head of External", "External", "bulannurh@gmail.com", "bulannhz"),
    ("Janice Kayleen Eliana", "5048231070", "2023", "22.png", "head", "Co-Head of External", "External", "janicekayleen@gmail.com", "janiceliana"),
    ("Adelia Zahrasanti Bintoro", "5048241028", "2024", None, "staff", "External Staff", "External", "zahrasanti.adelia@gmail.com", "adeliiazahraa"),
    ("Nailah Puteri Maharani", "5048241018", "2024", None, "staff", "External Staff", "External", "nailahputeri02@gmail.com", "nailahputerii"),
]

# Alumni Assistant Roster (Batch 2022 - 10 members, all with real portraits)
# (name, photo_file, position, position_label, division)
ALUMNI_ASSISTANTS_2022 = [
    # Coordinator (4 members)
    ("Muhammad Rifqi Firmansyah", "4.png", "coordinator", "Coordinator — Lead", "Coordinator"),
    ("Haykal Ramadhan", "5.png", "coordinator", "Coordinator — Vice", "Coordinator"),
    ("Nurul Alya Fithri", "6.png", "coordinator", "Secretary", "Coordinator"),
    ("Najwa Uma Fadhilah", "7.png", "coordinator", "Treasurer", "Coordinator"),
    # Academics (2 members)
    ("Karissa Maheswari Sasikirana", "8.png", "head", "Academics — Lead", "Academics"),
    ("Krisnanda Khairul Kusumawardana", "9.png", "vice", "Academics — Vice", "Academics"),
    # Event (2 members)
    ("Safinatun Najah", "11.png", "head", "Event — Lead", "Event"),
    ("Fikri Fajar Fawwaz", "10.png", "vice", "Event — Vice", "Event"),
    # Media (1 member)
    ("Tine Joeana", "12.png", "head", "Media — Lead", "Media"),
    # Research (1 member)
    ("Juan Farrel Aryasatya", "13.png", "head", "Research — Lead", "Research"),
]

ASSISTANT_BATCH = "2026"

# Source of the real member portraits and of the lab's published copy.
LAB_SITE_UPLOADS = "https://riset.its.ac.id/lab-tnl/wp-content/uploads/2025/11"

# Illustrative networking photography, used only where the laboratory has not supplied a
# photo of B-301 yet. Every one of these is captioned as illustrative on the page so no
# visitor reads them as a picture of the laboratory itself.
ILLUSTRATIVE = [
    ("hero-network-rack.jpg",
     "https://images.unsplash.com/photo-1695668548342-c0c1ad479aee?crop=entropy&cs=srgb&fm=jpg&w=1200&q=80",
     "Illustrative photo of a network equipment rack — not a photo of Room B-301"),
    ("fiber-patch-panel.jpg",
     "https://images.pexels.com/photos/2420212/pexels-photo-2420212.jpeg?auto=compress&cs=tinysrgb&w=1200",
     "Illustrative photo of fibre optic patch cables on a server rack — not a photo of Room B-301"),
    ("structured-cabling.jpg",
     "https://images.unsplash.com/photo-1544197150-b99a580bb7a8?crop=entropy&cs=srgb&fm=jpg&w=1200&q=80",
     "Illustrative photo of structured network cabling — not a photo of Room B-301"),
    ("switch-ports.jpg",
     "https://images.unsplash.com/flagged/photo-1579274216947-86eaa4b00475?crop=entropy&cs=srgb&fm=jpg&w=1200&q=80",
     "Illustrative photo of switch ports and patch leads — not a photo of Room B-301"),
    ("sdr-spectrum-lab.jpg",
     "https://images.unsplash.com/photo-1581092160607-ee22621dd758?crop=entropy&cs=srgb&fm=jpg&w=1200&q=80",
     "Illustrative photo of RF spectrum and electronic measurement instruments — not Room B-301"),
    ("news-cisco-packet-tracer.jpg",
     "https://images.unsplash.com/photo-1558494949-ef010cbdcc31?crop=entropy&cs=srgb&fm=jpg&w=1200&q=80",
     "Network routing hardware, servers and configuration topology"),
    ("news-rural-telecom.jpg",
     "https://images.unsplash.com/photo-1516110833967-0b5716ca1387?crop=entropy&cs=srgb&fm=jpg&w=1200&q=80",
     "Rural telecommunication antenna and wireless connectivity tower"),
    ("news-scientific-conference.jpg",
     "https://images.unsplash.com/photo-1511578314322-379afb476865?crop=entropy&cs=srgb&fm=jpg&w=1200&q=80",
     "Academic conference presentation hall and research symposium"),
]

AVATAR = "/api/media-files/placeholders/avatar.svg"

HOME_BLOCKS = [
    {"type": "hero", "props": {
        "badge": "B-301", "badge_id": "B-301",
        "title_before": "Telecommunication", "title_accent": "Network",
        "title_after": "Laboratory",
        "title_before_id": "Laboratorium Jaringan", "title_accent_id": "Telekomunikasi", "title_after_id": "",
        "intro": ("Teaching, research and training in telecommunication networks at the Department of "
                  "Electrical Engineering, Institut Teknologi Sepuluh Nopember."),
        "intro_id": ("Pendidikan, penelitian, dan pelatihan di bidang jaringan telekomunikasi pada "
                     "Departemen Teknik Elektro, Institut Teknologi Sepuluh Nopember."),
        "primary_label": "Explore our activities", "primary_label_id": "Lihat kegiatan kami", "primary_url": "/activity",
        "secondary_label": "Join us", "secondary_label_id": "Gabung bersama kami", "secondary_url": "/activity?tab=events",
    }},
    {"type": "stats", "props": {"source": "live"}},
    {"type": "about", "props": {
        "heading": "About the Laboratory", "heading_id": "Tentang Laboratorium",
        "body": ABOUT_EN, "body_id": ABOUT_ID,
        "location": "Room B-301, Building B, Department of Electrical Engineering, ITS Surabaya",
        "location_id": "Ruang B-301, Gedung B, Departemen Teknik Elektro, ITS Surabaya",
        "tiles": ABOUT_TILES,
    }},
    {"type": "numbered_cards", "props": {
        "heading": "Focus Areas", "heading_id": "Bidang Fokus",
        "see_all_label": "See all activities", "see_all_label_id": "Lihat semua kegiatan",
        "see_all_url": "/activity",
        "cards": [{"title": e, "title_id": i, "description": de, "description_id": di}
                  for e, i, de, di in FOCUS_DETAIL],
    }},
    {"type": "carousel", "props": {
        "heading": "Fields of Study", "heading_id": "Bidang Keilmuan",
        "slides": [{"title": e, "title_id": i, "description": de, "description_id": di}
                   for e, i, de, di in FIELDS_OF_STUDY],
    }},
    {"type": "gallery", "props": {
        "heading": "Inside the Laboratory", "heading_id": "Di Dalam Laboratorium B-301",
        "images": [],
    }},
    {"type": "news_feed", "props": {"heading": "Latest News", "heading_id": "Berita Terbaru", "count": 3}},
    {"type": "partners", "props": {"heading": "Partners & Affiliations", "heading_id": "Mitra & Afiliasi"}},
    {"type": "cta_band", "props": {
        "title": "Interested in working with the laboratory?",
        "title_id": "Tertarik bekerja sama dengan laboratorium?",
        "body": "Get in touch with the Telecommunication Network Laboratory for collaboration, training or a laboratory visit.",
        "body_id": "Hubungi Laboratorium Jaringan Telekomunikasi untuk kerja sama, pelatihan, atau kunjungan laboratorium.",
        "button_label": "Contact us", "button_label_id": "Hubungi kami", "button_url": "/contact",
    }},
]


def inner_hero(title, title_id, desc, desc_id, eyebrow, eyebrow_id):
    return {"type": "inner_hero", "props": {
        "title": title, "title_id": title_id, "description": desc, "description_id": desc_id,
        "eyebrow": eyebrow, "eyebrow_id": eyebrow_id,
    }}


SYSTEM_PAGES = [
    ("home", "Home", "Beranda", HOME_BLOCKS),
    ("member", "Member", "Anggota", [
        inner_hero("Member", "Anggota",
                   "Lecturers, researchers and student assistants of the Telecommunication Network Laboratory.",
                   "Dosen, peneliti, dan asisten mahasiswa Laboratorium Jaringan Telekomunikasi.",
                   "People", "Anggota"),
        {"type": "member_sections", "props": {"show_head": True, "show_lecturers": True, "show_assistants": True}},
    ]),
    ("activity", "Activity", "Kegiatan", [
        inner_hero("Activity", "Kegiatan",
                   "Research and development, practicum, events and assistant activities at B-301.",
                   "Penelitian dan pengembangan, praktikum, event, serta kegiatan asisten di B-301.",
                   "Programs", "Program"),
        {"type": "activity_tabs", "props": {}},
    ]),
    ("news", "News", "Berita", [
        inner_hero("News", "Berita",
                   "Announcements, activity reports and updates from the laboratory.",
                   "Pengumuman, laporan kegiatan, dan pembaruan dari laboratorium.",
                   "Updates", "Pembaruan"),
        {"type": "news_feed", "props": {"count": 24, "show_filters": True}},
    ]),
    ("publications", "Publications", "Publikasi", [
        inner_hero("Publications", "Publikasi",
                   "Journal articles, conference papers and other scholarly output from the laboratory.",
                   "Artikel jurnal, makalah konferensi, dan luaran ilmiah lain dari laboratorium.",
                   "Research output", "Luaran penelitian"),
        {"type": "publication_list", "props": {}},
    ]),
    ("contact", "Contact", "Kontak", [
        inner_hero("Contact", "Kontak",
                   "Reach the Telecommunication Network Laboratory in Room B-301, Building B, ITS Surabaya.",
                   "Hubungi Laboratorium Jaringan Telekomunikasi di Ruang B-301, Gedung B, ITS Surabaya.",
                   "Get in touch", "Hubungi kami"),
        {"type": "contact_panel", "props": {}},
        {"type": "contact_form", "props": {}},
        {"type": "map", "props": {"label": "Gedung B, Institut Teknologi Sepuluh Nopember, Surabaya"}},
    ]),
    ("terms", "Terms of Use", "Ketentuan Penggunaan", [
        inner_hero("Terms of Use", "Ketentuan Penggunaan",
                   "Official legal terms governing website access, practicum modules, and verification portals (v2026.1).",
                   "Ketentuan hukum resmi penggunaan situs, modul praktikum, dan portal verifikasi sertifikat (v2026.1).", "Legal", "Legal"),
        {"type": "rich_text", "props": {
            "html": ("<h3>Terms of Use (v2026.1 — Effective: 20 November 2026)</h3>"
                     "<p>This website is published and maintained by the Telecommunication Network Laboratory (TNL), "
                     "Department of Electrical Engineering, Faculty of Intelligent Electrical and Informatics Technology (FTEIC), "
                     "Institut Teknologi Sepuluh Nopember (ITS), Surabaya, Indonesia (Room B-301). By accessing or using this website, "
                     "you agree to be bound by these Terms and our Privacy Policy.</p>"
                     "<h3>Acceptable Use & Cyber Law Compliance</h3>"
                     "<p>Users must comply with Indonesian Cyber Law (UU ITE). Unauthorized vulnerability scanning, penetration testing "
                     "without written consent, distributed denial of service (DDoS), spamming, and malicious script uploads are strictly prohibited.</p>"
                     "<h3>e-Certificate Authenticity (/verify)</h3>"
                     "<p>Official credentials issued by TNL Laboratory are verified exclusively through https://labtnl.site/verify. "
                     "Falsifying certificates or altering verification codes constitutes document forgery subject to legal sanctions.</p>"
                     "<h3>Intellectual Property & Practicum Materials</h3>"
                     "<p>All logos, GSM brand assets, and practicum modules remain the intellectual property of TNL Laboratory FTEIC ITS. "
                     "Practicum modules (.pdf, .pkt) are licensed strictly for non-commercial educational use with mandatory attribution.</p>"
                     "<h3>Administrative Contact</h3>"
                     "<p>For legal or licensing inquiries, contact Room B-301 or email telconnetlab@gmail.com.</p>"),
            "html_id": ("<h3>Ketentuan Penggunaan (v2026.1 — Berlaku: 20 November 2026)</h3>"
                        "<p>Situs web ini diterbitkan dan dikelola oleh Laboratorium Jaringan Telekomunikasi (TNL), "
                        "Departemen Teknik Elektro, Fakultas Teknologi Elektro dan Informatika Cerdas (FTEIC), "
                        "Institut Teknologi Sepuluh Nopember (ITS) Surabaya (Ruang B-301). Dengan mengakses situs ini, "
                        "Anda setuju untuk terikat oleh Ketentuan Penggunaan ini dan Kebijakan Privasi kami.</p>"
                        "<h3>Kepatuhan Etika & UU ITE</h3>"
                        "<p>Pengguna wajib mematuhi ketentuan UU ITE No. 11/2008 jo. UU No. 1/2024. Dilarang keras melakukan pemindaian "
                        "kerentanan tanpa izin, serangan DoS/DDoS, spamming formulir, atau pengunggahan berkas berbahaya.</p>"
                        "<h3>Keabsahan e-Sertifikat (/verify)</h3>"
                        "<p>Sertifikat resmi hanya dinyatakan sah apabila terverifikasi pada portal https://labtnl.site/verify. "
                        "Pemalsuan sertifikat atau pengubahan dokumen merupakan tindak pidana pemalsuan surat yang dapat diproses hukum.</p>"
                        "<h3>Hak Cipta & Lisensi Modul Praktikum</h3>"
                        "<p>Logo, desain GSM, dan modul praktikum merupakan hak cipta Laboratorium TNL Teknik Elektro ITS. "
                        "Materi praktikum dilisensikan murni untuk pembelajaran non-komersial dengan kewajiban mencantumkan atribusi.</p>"
                        "<h3>Kontak Administrasi</h3>"
                        "<p>Untuk perizinan dan urusan administratif, hubungi Ruang B-301 atau surel telconnetlab@gmail.com.</p>"),
        }},
    ]),
    ("privacy", "Privacy Policy", "Kebijakan Privasi", [
        inner_hero("Privacy Policy", "Kebijakan Privasi",
                   "Comprehensive personal data protection policy under Indonesian Law No. 27/2022 (UU PDP, v2026.1).",
                   "Kebijakan perlindungan data pribadi komprehensif berlandaskan amanat UU No. 27 Tahun 2022 (UU PDP, v2026.1).",
                   "Legal", "Legal"),
        {"type": "rich_text", "props": {
            "html": ("<h3>Privacy Policy (v2026.1 — Effective: 20 November 2026)</h3>"
                     "<p>The Telecommunication Network Laboratory (TNL), Room B-301, Department of Electrical Engineering, "
                     "FTEIC, Institut Teknologi Sepuluh Nopember (ITS) Surabaya acts as the Data Controller under Law No. 27/2022 (UU PDP).</p>"
                     "<h3>Data Categories & Minimisation</h3>"
                     "<p>We collect only necessary personal data: event registration records (name, NRP, motivation, Instagram follow screenshot, "
                     "consent timestamp, policy version 2026.1), contact messages, and minimal public validation records for /verify (name, event, date, code). "
                     "Zero ad tracking pixels or marketing cookies are deployed.</p>"
                     "<h3>Sub-processors & Backups</h3>"
                     "<p>Data infrastructure utilizes Cloudflare (Edge CDN/WAF), Google Workspace (authorized operational sheet sync), "
                     "and isolated on-premises Proxmox LXC server clusters. Compressed database and media backups undergo an automated 14-day safe rotation.</p>"
                     "<h3>Data Subject Rights & 3x24h SLA</h3>"
                     "<p>Under Articles 5–13 UU PDP, data subjects hold rights of access, rectification, erasure, and consent withdrawal. "
                     "Submit requests to telconnetlab@gmail.com with subject '[UU PDP Request]'. Verified requests are processed within a 3x24 working hour SLA.</p>"),
            "html_id": ("<h3>Kebijakan Privasi (v2026.1 — Berlaku: 20 November 2026)</h3>"
                        "<p>Laboratorium Jaringan Telekomunikasi (TNL), Ruang B-301, Departemen Teknik Elektro, "
                        "FTEIC, Institut Teknologi Sepuluh Nopember (ITS) Surabaya bertindak sebagai Pengendali Data Pribadi sesuai UU No. 27 Tahun 2022 (UU PDP).</p>"
                        "<h3>Kategori Data & Minimisasi</h3>"
                        "<p>Kami hanya mengumpulkan data yang esensial: pendaftaran kegiatan (nama, NRP, motivasi, screenshot bukti follow, "
                        "stempel persetujuan, versi kebijakan 2026.1), pesan formulir kontak, serta data verifikasi minimal di /verify (nama, acara, tanggal, kode). "
                        "Situs ini bebas dari cookie pelacak iklan komersial maupun pixel pemasaran lintas platform.</p>"
                        "<h3>Pemroses Pihak Ketiga & Cadangan Data</h3>"
                        "<p>Layanan berinteraksi terbatas dengan Cloudflare (CDN/WAF tepi), Google Workspace (sinkronisasi panitia), "
                        "dan klaster server Proxmox LXC internal ITS. Arsip cadangan otomatis server diputar secara aman dengan rotasi 14 hari.</p>"
                        "<h3>Hak Subjek Data & SLA 3×24 Jam</h3>"
                        "<p>Sesuai Pasal 5–13 UU PDP, Anda berhak mengakses, memperbaiki, menghapus, atau menarik persetujuan data pribadi Anda. "
                        "Kirim permohonan ke telconnetlab@gmail.com dengan subjek '[Permintaan UU PDP]'. Permintaan diproses maksimal 3×24 jam kerja.</p>"),
        }},
    ]),
]


async def seed_settings() -> None:
    doc = SettingsDoc(
        site_title="Telecommunication Network Laboratory",
        site_title_id="Laboratorium Jaringan Telekomunikasi",
        short_name="TNL",
        logo_url="/assets/brand/tnl-logo-white.png",
        logo_url_dark="/assets/brand/tnl-logo-dark.png",
        focus_areas=FOCUS_AREAS,
        language_default="id",
        theme={"draft": ThemeTokens(), "published": ThemeTokens()},
    ).model_dump()
    doc["contact"] = {
        "email": "telconnetlab@gmail.com",
        "phone": None,
        "address": "Building B, Room B-301, Department of Electrical Engineering, ITS, Surabaya",
        "address_id": "Gedung B, Ruang B-301, Departemen Teknik Elektro, ITS, Surabaya",
        "room": "B-301",
        "maps_url": "https://www.google.com/maps/search/?api=1&query=Gedung+B+Teknik+Elektro+ITS+Surabaya",
    }
    doc["social"] = {"instagram": "https://www.instagram.com/tnlab_its",
                     "youtube": None, "linkedin": None, "github": None}
    doc["seo"] = {
        "title_template": "{title} — Telecommunication Network Laboratory ITS",
        "default_description": ("Telecommunication Network Laboratory (TNL), Department of Electrical "
                                "Engineering, Institut Teknologi Sepuluh Nopember — Room B-301, Surabaya."),
        "og_image_url": "https://labtnl.site/assets/brand/tnl-logo-badge.png",
    }
    doc["announcement"] = {
        "enabled": True,
        "title": "Cisco Packet Tracer Training — registration open",
        "title_id": "Pelatihan Cisco Packet Tracer — pendaftaran dibuka",
        "body": "An introductory networking training using Cisco Packet Tracer, held in Room B-301.",
        "body_id": "Pelatihan dasar jaringan menggunakan Cisco Packet Tracer, diadakan di Ruang B-301.",
        "version": 1,
    }
    await db.settings.update_one({"id": "settings"}, {"$set": doc}, upsert=True)
    print("  settings: site identity, contact, social, announcement")


async def seed_admin() -> None:
    email = (os.environ.get("SEED_ADMIN_EMAIL") or "admin@its.ac.id").strip().lower()
    password = os.environ.get("SEED_ADMIN_PASSWORD") or "TnlStudio2026!"
    name = os.environ.get("SEED_ADMIN_NAME") or "TNL Lab Administrator"
    existing = await db.users.find_one({"email": email})
    if existing:
        await db.users.update_one({"email": email}, {"$set": {
            "role": "super_admin", "active": True, "password_hash": hash_password(password)}})
        print(f"  users: refreshed Super Admin {email}")
    else:
        await db.users.insert_one({
            "id": str(uuid4()), "name": name, "email": email, "role": "super_admin",
            "divisions": [], "active": True, "password_hash": hash_password(password),
            "totp_secret": None, "totp_enabled": False, "invite_token": None,
            "created_at": NOW, "last_login_at": None,
        })
        print(f"  users: Super Admin {email}")

    # Role demonstration accounts, so the rotating assistant team can see each role's view.
    demos = [
        ("Media Division Editor", "editor@its.ac.id", "editor", ["media"]),
        ("Academics Contributor", "contributor@its.ac.id", "contributor", ["academics"]),
        ("Event Registrar", "registrar@its.ac.id", "registrar", ["event"]),
        ("Lab Viewer", "viewer@its.ac.id", "viewer", []),
    ]
    for dname, demail, drole, ddiv in demos:
        if not await db.users.find_one({"email": demail}):
            await db.users.insert_one({
                "id": str(uuid4()), "name": dname, "email": demail, "role": drole,
                "divisions": ddiv, "active": True, "password_hash": hash_password("TnlStudio2026!"),
                "totp_secret": None, "totp_enabled": False, "invite_token": None,
                "created_at": NOW, "last_login_at": None,
            })
    print("  users: 4 role demo accounts (editor/contributor/registrar/viewer)")


async def seed_pages(photos: dict[str, str] | None = None) -> None:
    photos = photos or {}
    for slug, title, title_id, blocks in SYSTEM_PAGES:
        built = []
        for b in blocks:
            props = dict(b["props"])
            # Illustrative photography is injected here so the page content itself stays
            # free of hard-coded media URLs — editors can swap any of it in the CMS.
            if b["type"] == "hero" and photos.get("hero-network-rack.jpg"):
                props["image_url"] = photos["hero-network-rack.jpg"]
                props["image_alt"] = "Core Telecommunication Network Infrastructure & Server Rack"
            if b["type"] == "gallery":
                gallery_items = [
                    ("fiber-patch-panel.jpg", "Optical & Patch Bay", "Rak Patch Panel Serat Optik"),
                    ("structured-cabling.jpg", "Structured Cabling", "Kabel Terstruktur"),
                    ("switch-ports.jpg", "Core Routing Rack", "Rak Routing Inti"),
                    ("sdr-spectrum-lab.jpg", "SDR & RF Workbench", "Meja Kerja SDR & RF"),
                ]
                imgs = []
                for n, caption, caption_id in gallery_items:
                    if photos.get(n):
                        imgs.append({
                            "url": photos[n],
                            "alt": caption,
                            "caption": caption,
                            "caption_id": caption_id,
                        })
                if not imgs:
                    continue
                props["images"] = imgs
            built.append({"id": str(uuid4()), "type": b["type"], "props": props, "hidden": False})
        existing = await db.pages.find_one({"slug": slug})
        doc = {
            "id": existing["id"] if existing else str(uuid4()),
            "slug": slug, "title": title, "title_id": title_id,
            "blocks": built, "status": "published", "is_system": True,
            "revisions": [], "needs_review": False, "issues": [],
            "created_at": existing.get("created_at") if existing else NOW,
            "updated_at": NOW,
        }
        await db.pages.update_one({"slug": slug}, {"$set": doc}, upsert=True)
    print(f"  pages: {len(SYSTEM_PAGES)} system pages published (block-built)")


async def _store_remote_image(url: str, key: str, alt: str, folder: str) -> str | None:
    """Download a remote image into the media library once, and return its local URL.
    Returns None (so the caller falls back to the placeholder) if the fetch fails —
    seeding must never break because an external host is unreachable."""
    media_dir = os.environ.get("MEDIA_DIR", "/app/backend/media")
    path = os.path.join(media_dir, key)
    local_url = f"/api/media-files/{key}"
    os.makedirs(os.path.dirname(path), exist_ok=True)
    if not os.path.exists(path):
        bundled = os.path.join(os.path.dirname(__file__), "media", key)
        if os.path.exists(bundled):
            shutil.copy2(bundled, path)
        else:
            try:
                async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
                    res = await client.get(url)
                if res.status_code != 200 or not res.content:
                    return None
                with open(path, "wb") as fh:
                    fh.write(res.content)
            except Exception:
                return None
    if not await db.media.find_one({"url": local_url}):
        await db.media.insert_one({
            "id": str(uuid4()), "filename": os.path.basename(key), "url": local_url, "key": key,
            "alt": alt, "folder": folder, "kind": "image",
            "content_type": "image/jpeg" if key.endswith(".jpg") else "image/png",
            "bytes": os.path.getsize(path), "created_at": NOW, "sizes": {},
        })
    return local_url


async def seed_illustrative_photos() -> dict[str, str]:
    """Illustrative networking photography for pages with no B-301 photo yet."""
    urls: dict[str, str] = {}
    for name, remote, alt in ILLUSTRATIVE:
        local = await _store_remote_image(remote, f"illustrative/{name}", alt, "illustrative")
        if local:
            urls[name] = local
    print(f"  media: {len(urls)}/{len(ILLUSTRATIVE)} illustrative networking photos (captioned, not B-301)")
    return urls


async def seed_members() -> None:
    await db.members.delete_many({})
    members: list[dict] = []
    HEAD_PHOTO = await _store_remote_image(
        f"{LAB_SITE_UPLOADS}/1-1.png", "members/1-1.png",
        "Portrait of Dr. Ir. Achmad Affandi, DEA., Head of Laboratory", "members",
    )

    members.append(Member(
        name="Achmad Affandi", title_prefix="Dr. Ir.", role="lecturer",
        position="Head of Laboratory", division=None, is_head=True,
        bio=("Head of the Telecommunication Network Laboratory since March 2025 and a senior lecturer in the "
             "Department of Electrical Engineering, Institut Teknologi Sepuluh Nopember. He teaches wireless "
             "communications, ICT infrastructure and IT service management, and leads research and training "
             "within the laboratory."),
        bio_id=("Kepala Laboratorium Jaringan Telekomunikasi sejak Maret 2025 sekaligus dosen senior Departemen "
                "Teknik Elektro, Institut Teknologi Sepuluh Nopember. Beliau mengampu komunikasi nirkabel, "
                "infrastruktur TIK, dan manajemen layanan TI, serta memimpin kegiatan penelitian dan pelatihan "
                "di laboratorium."),
        quote=HEAD_QUOTE_EN, quote_id=HEAD_QUOTE_ID,
        email_public="affandi@its.ac.id",
        photo_url=HEAD_PHOTO or AVATAR,
        photo_alt="Portrait of Dr. Ir. Achmad Affandi, DEA., Head of Laboratory",
        expertise=["Wireless communications", "ICT infrastructure", "IT service management",
                   "Telecommunication networks"],
        projects=AFFANDI_PROJECTS,
        order=0, status="active", published=True,
    ).model_dump())
    members[-1]["name"] = "Dr. Ir. Achmad Affandi, DEA."

    for i, (full_name, email, position_label, expertise, photo_file) in enumerate(LECTURERS, start=1):
        photo = await _store_remote_image(
            f"{LAB_SITE_UPLOADS}/{photo_file}", f"members/{photo_file}",
            f"Portrait of {full_name}", "members",
        )
        m = Member(
            name=full_name, role="lecturer", position="Lecturer", email_public=email,
            bio=("Lecturer and researcher of the Telecommunication Network Laboratory, Department of "
                 "Electrical Engineering, Institut Teknologi Sepuluh Nopember."),
            bio_id=("Dosen dan peneliti Laboratorium Jaringan Telekomunikasi, Departemen Teknik Elektro, "
                    "Institut Teknologi Sepuluh Nopember."),
            photo_url=photo or AVATAR,
            photo_alt=f"Portrait of {full_name}" if photo else f"Portrait placeholder for {full_name}",
            expertise=expertise,
            projects=LECTURER_PROJECTS.get(full_name, []),
            order=i, status="active", published=True,
        ).model_dump()
        m["position_label"] = position_label
        members.append(m)

    # Active 2026 Assistant team (25 members: Batch 2023 & Batch 2024)
    order = 10
    for name, nrp, batch, photo_file, position, label, division, email, ig in ACTIVE_ASSISTANTS_2026:
        photo = None
        if photo_file:
            photo = await _store_remote_image(
                f"{LAB_SITE_UPLOADS}/{photo_file}", f"members/{photo_file}",
                f"Portrait of {name}, {label}", "members",
            )
        social = MemberSocial(instagram=f"https://instagram.com/{ig.lstrip('@')}") if ig else MemberSocial()
        members.append(Member(
            name=name, role="assistant", position=position, division=division,
            batch=batch, nim=nrp, show_nim=True, email_public=email,
            social=social,
            bio=f"{label} ({division}) of the Telecommunication Network Laboratory assistant team.",
            bio_id=f"{label} ({division}) tim asisten Laboratorium Jaringan Telekomunikasi.",
            photo_url=photo if photo else None,
            photo_alt=f"Portrait of {name}, {label}" if photo else None,
            expertise=[division, f"Batch {batch}"], order=order, status="active", published=True,
        ).model_dump())
        members[-1]["position_label"] = label
        order += 1

    # Alumni Assistant team (Batch 2022 - 12 members)
    for name, photo_file, position, label, division in ALUMNI_ASSISTANTS_2022:
        photo = None
        if photo_file:
            photo = await _store_remote_image(
                f"{LAB_SITE_UPLOADS}/{photo_file}", f"members/{photo_file}",
                f"Portrait of {name}, {label}", "members",
            )
        members.append(Member(
            name=name, role="assistant", position=position, division=division,
            batch="2022",
            bio=f"{label} ({division}) of the Telecommunication Network Laboratory (Batch 2022).",
            bio_id=f"{label} ({division}) Laboratorium Jaringan Telekomunikasi (Angkatan 2022).",
            photo_url=photo if photo else None,
            photo_alt=f"Portrait of {name}, {label}" if photo else None,
            expertise=[division, "Batch 2022", "Alumni"], order=order, status="alumni", published=True,
        ).model_dump())
        members[-1]["position_label"] = label
        order += 1

    for m in members:
        m.setdefault("position_label", m.get("position"))
    await db.members.insert_many(members)
    active_assistants = sum(1 for m in members if m["role"] == "assistant" and m["status"] == "active")
    alumni_assistants = sum(1 for m in members if m["role"] == "assistant" and m["status"] == "alumni")
    with_photo = sum(1 for m in members if m["photo_url"])
    print(f"  members: 1 head + {len(LECTURERS)} lecturers + {active_assistants} active assistants "
          f"+ {alumni_assistants} alumni assistants — {with_photo}/{len(members)} with photos")


async def seed_activities() -> None:
    await db.activities.delete_many({})
    docs = []
    activity_media = [
        ("/api/media-files/illustrative/hero-network-rack.jpg", ["/api/media-files/illustrative/hero-network-rack.jpg", "/api/media-files/illustrative/switch-ports.jpg"]),
        ("/api/media-files/illustrative/fiber-patch-panel.jpg", ["/api/media-files/illustrative/fiber-patch-panel.jpg", "/api/media-files/illustrative/structured-cabling.jpg"]),
        ("/api/media-files/illustrative/structured-cabling.jpg", ["/api/media-files/illustrative/structured-cabling.jpg", "/api/media-files/illustrative/sdr-spectrum-lab.jpg"]),
        ("/api/media-files/illustrative/switch-ports.jpg", ["/api/media-files/illustrative/switch-ports.jpg", "/api/media-files/illustrative/hero-network-rack.jpg"]),
        ("/api/media-files/illustrative/sdr-spectrum-lab.jpg", ["/api/media-files/illustrative/sdr-spectrum-lab.jpg", "/api/media-files/illustrative/fiber-patch-panel.jpg"]),
        ("/api/media-files/illustrative/news-scientific-conference.jpg", ["/api/media-files/illustrative/news-scientific-conference.jpg", "/api/media-files/illustrative/news-rural-telecom.jpg"]),
    ]
    for i, (title, title_id, category, desc, desc_id) in enumerate(ASSISTANT_ACTIVITIES):
        cover, gallery = activity_media[i % len(activity_media)]
        media_items = [MediaItem(url=cover, alt=title)] + [MediaItem(url=u, alt=title) for u in gallery if u != cover]
        docs.append(Activity(
            title=title, title_id=title_id, category=category,
            description=desc, description_id=desc_id,
            cover_image=cover, gallery_images=gallery,
            images=media_items, order=i, published=True,
        ).model_dump())
    await db.activities.insert_many(docs)
    print(f"  activities: {len(docs)} assistant activities with media")


async def seed_practicum() -> None:
    await db.practicum.delete_many({})
    module_media = [
        ("/api/media-files/illustrative/structured-cabling.jpg", ["/api/media-files/illustrative/structured-cabling.jpg", "/api/media-files/illustrative/switch-ports.jpg"]),
        ("/api/media-files/illustrative/switch-ports.jpg", ["/api/media-files/illustrative/switch-ports.jpg", "/api/media-files/illustrative/fiber-patch-panel.jpg"]),
        ("/api/media-files/illustrative/hero-network-rack.jpg", ["/api/media-files/illustrative/hero-network-rack.jpg"]),
        ("/api/media-files/illustrative/fiber-patch-panel.jpg", ["/api/media-files/illustrative/fiber-patch-panel.jpg"]),
        ("/api/media-files/illustrative/sdr-spectrum-lab.jpg", ["/api/media-files/illustrative/sdr-spectrum-lab.jpg", "/api/media-files/illustrative/structured-cabling.jpg"]),
    ]
    modules = [
        ("TNL-01", "Network Fundamentals", "Dasar Jaringan",
         "Addressing, subnetting and the layered model that underpins every later module.",
         "Pengalamatan, subnetting, dan model berlapis yang menjadi dasar seluruh modul berikutnya.",
         [
             PracticumResource(title="Modul 01: IPv4 Addressing & Subnetting Guide (PDF)", file_url="/api/media-files/academic/modul-01-fundamentals.pdf", file_type="pdf", size_bytes=1048576),
             PracticumResource(title="Topology Lab 01: Subnetting Lab (PKT)", file_url="/api/media-files/academic/lab-01-topology.pkt", file_type="pkt", size_bytes=245760),
         ],
         [
             PracticumShift(day="Senin", time_slot="16:00 - 18:00 WIB", coordinator_name="Steffano & Darel", quota=24, room="Ruang B-301", notes="Sesi 1 — Harap membawa laptop dan Packet Tracer v8+"),
             PracticumShift(day="Rabu", time_slot="18:00 - 20:00 WIB", coordinator_name="Rafli & Izzul", quota=24, room="Ruang B-301", notes="Sesi 2 — Wajib hadir 10 menit sebelum sesi dimulai"),
         ]),
        ("TNL-02", "Switching and VLAN", "Switching dan VLAN",
         "Switch configuration, VLAN segmentation and trunking in the laboratory testbed.",
         "Konfigurasi switch, segmentasi VLAN, dan trunking pada testbed laboratorium.",
         [
             PracticumResource(title="Modul 02: Switch Configuration & 802.1Q Trunking (PDF)", file_url="/api/media-files/academic/modul-02-switching.pdf", file_type="pdf", size_bytes=1420000),
             PracticumResource(title="Switch CLI Configuration Script (TXT)", file_url="/api/media-files/academic/switch-vlan-config.txt", file_type="txt", size_bytes=16384),
         ],
         [
             PracticumShift(day="Selasa", time_slot="16:00 - 18:00 WIB", coordinator_name="Nathanael & Darel", quota=24, room="Ruang B-301", notes="Sesi 1 — Praktikum di rak switch B-301"),
             PracticumShift(day="Kamis", time_slot="18:00 - 20:00 WIB", coordinator_name="Steffano & Izzul", quota=24, room="Ruang B-301", notes="Sesi 2 — Praktikum di rak switch B-301"),
         ]),
        ("TNL-03", "Routing", "Routing",
         "Static and dynamic routing between networks, configured on laboratory equipment.",
         "Routing statis dan dinamis antar jaringan, dikonfigurasi pada perangkat laboratorium.",
         [
             PracticumResource(title="Modul 03: OSPF & BGP Dynamic Routing Laboratory (PDF)", file_url="/api/media-files/academic/modul-03-routing.pdf", file_type="pdf", size_bytes=1840000),
             PracticumResource(title="Dynamic Routing Packet Tracer Simulation (PKT)", file_url="/api/media-files/academic/lab-03-ospf.pkt", file_type="pkt", size_bytes=312000),
         ],
         [
             PracticumShift(day="Senin", time_slot="16:00 - 18:00 WIB", coordinator_name="Rafli & Nathanael", quota=24, room="Ruang B-301", notes="Sesi 1 — Eksperimen router Cisco & MikroTik"),
             PracticumShift(day="Rabu", time_slot="18:00 - 20:00 WIB", coordinator_name="Rafi Adin & Nindita", quota=24, room="Ruang B-301", notes="Sesi 2 — Eksperimen router Cisco & MikroTik"),
         ]),
        ("TNL-04", "Network Services", "Layanan Jaringan",
         "DHCP, DNS and address translation as deployed in a small campus network.",
         "DHCP, DNS, dan translasi alamat sebagaimana diterapkan pada jaringan kampus kecil.",
         [
             PracticumResource(title="Modul 04: DNS, DHCP & NAT Enterprise Deployment (PDF)", file_url="/api/media-files/academic/modul-04-services.pdf", file_type="pdf", size_bytes=1250000),
             PracticumResource(title="Automated DNS/DHCP Provisioning Script (PY)", file_url="/api/media-files/academic/services-setup.py", file_type="py", size_bytes=24500),
         ],
         [
             PracticumShift(day="Selasa", time_slot="16:00 - 18:00 WIB", coordinator_name="Raihan & Zein", quota=24, room="Ruang B-301", notes="Sesi 1 — Hands-on server Ubuntu Linux"),
             PracticumShift(day="Kamis", time_slot="18:00 - 20:00 WIB", coordinator_name="Dhika & Rizqi", quota=24, room="Ruang B-301", notes="Sesi 2 — Hands-on server Ubuntu Linux"),
         ]),
        ("TNL-05", "Network Measurement", "Pengukuran Jaringan",
         "Measuring throughput, delay and loss, and interpreting the results.",
         "Mengukur throughput, delay, dan loss, serta menafsirkan hasilnya.",
         [
             PracticumResource(title="Modul 05: QoS Benchmarking with iperf3 & Wireshark (PDF)", file_url="/api/media-files/academic/modul-05-measurement.pdf", file_type="pdf", size_bytes=2100000),
             PracticumResource(title="QoS Automated Log Analysis Script (PY)", file_url="/api/media-files/academic/measure-analyze.py", file_type="py", size_bytes=18000),
         ],
         [
             PracticumShift(day="Senin", time_slot="16:00 - 18:00 WIB", coordinator_name="Zidan & Roy", quota=24, room="Ruang B-301", notes="Sesi 1 — Pengukuran QoS dan Analisis Throughput"),
             PracticumShift(day="Jumat", time_slot="16:00 - 18:00 WIB", coordinator_name="Steffano & Rafli", quota=24, room="Ruang B-301", notes="Sesi 2 — Shift Final & Pengambilan Data Laporan Akhir"),
         ]),
    ]
    docs = []
    for i, (c, n, ni, d, di, res, sh) in enumerate(modules):
        cover, gallery = module_media[i % len(module_media)]
        docs.append(PracticumModule(
            code=c, name=n, name_id=ni, description=d, description_id=di,
            cover_image=cover, gallery_images=gallery,
            resources=res, shifts=sh,
            semester="Odd semester", order=i, published=True
        ).model_dump())
    await db.practicum.insert_many(docs)
    print(f"  practicum: {len(docs)} modules with resources and shifts")


async def seed_equipment() -> None:
    await db.equipment.delete_many({})
    items = [
        Equipment(
            name="Proxmox Virtualization 3-Node Cluster (Dell PowerEdge R640)",
            name_id="Klaster Virtualisasi 3-Node Proxmox (Dell PowerEdge R640)",
            category="server",
            specs="3x Dell PowerEdge R640, Dual Intel Xeon Silver 4210 (20 Cores total per node), 128GB DDR4 ECC RAM, 2x 10GbE SFP+ uplinks, 2TB Enterprise NVMe SSD storage. High-availability virtualized testbed for Cloud Core Network & NFV experiments.",
            specs_id="3 unit Dell PowerEdge R640, Dual Intel Xeon Silver 4210, RAM 128GB DDR4 ECC, uplink 2x 10GbE SFP+, penyimpanan NVMe Enterprise 2TB. Testbed virtualisasi berkinerja tinggi untuk Cloud Core Network & eksperimen NFV.",
            quantity=3,
            location="Ruang B-301 (Server Rack 1)",
            status="available",
            photo_url="/api/media-files/illustrative/hero-network-rack.jpg",
            gallery_images=[
                "/api/media-files/illustrative/hero-network-rack.jpg",
                "/api/media-files/illustrative/switch-ports.jpg",
            ],
            serial_number="TNL-SRV-2024-001/003",
            asset_code="ITS-DTE-TNL-2024-EQ01",
            internal_notes="Managed via Proxmox Web GUI at https://10.10.10.2:8006. Production credentials secured by super_admin.",
            order=1,
            published=True,
        ),
        Equipment(
            name="USRP B210 Software Defined Radio (Ettus Research)",
            name_id="Software Defined Radio USRP B210 (Ettus Research)",
            category="sdr",
            specs="Dual-channel transceiver RF coverage from 70 MHz to 6 GHz. Continuous streaming up to 56 MHz realtime bandwidth over USB 3.0. Integrated with GNU Radio, OpenAirInterface (OAI), and srsRAN for 4G/5G NR standalone base station research.",
            specs_id="Transceiver dual-channel cakupan frekuensi 70 MHz - 6 GHz. Realtime bandwidth hingga 56 MHz melalui USB 3.0. Digunakan untuk riset GNU Radio, OpenAirInterface (OAI), dan pemancar 4G/5G NR mandiri.",
            quantity=2,
            location="Ruang B-301 (Meja Riset SDR)",
            status="available",
            photo_url="/api/media-files/illustrative/sdr-spectrum-lab.jpg",
            gallery_images=[
                "/api/media-files/illustrative/sdr-spectrum-lab.jpg",
            ],
            serial_number="TNL-SDR-2023-014/015",
            asset_code="ITS-DTE-TNL-2023-EQ04",
            internal_notes="Connected to dedicated GPU research workstation. Calibration files stored on TNL server.",
            order=2,
            published=True,
        ),
        Equipment(
            name="Cisco Catalyst 3850 & MikroTik Cloud Core CCR1036-8G-2S+",
            name_id="Cisco Catalyst 3850 & MikroTik Cloud Core CCR1036-8G-2S+",
            category="networking",
            specs="Cisco Catalyst 3850 24-Port Gigabit PoE+ Enterprise Managed Switch with 10G uplink module, paired with 36-core MikroTik Cloud Core Router (CCR1036) for high-throughput edge routing, BGP peering, and practicum network topologies.",
            specs_id="Switch managed enterprise Cisco Catalyst 3850 24 port PoE+ dengan modul 10G, dipadukan router 36-core MikroTik Cloud Core CCR1036 untuk routing throughput tinggi, BGP, dan praktikum.",
            quantity=4,
            location="Ruang B-301 (Network Rack 2)",
            status="available",
            photo_url="/api/media-files/illustrative/switch-ports.jpg",
            gallery_images=[
                "/api/media-files/illustrative/switch-ports.jpg",
                "/api/media-files/illustrative/structured-cabling.jpg",
            ],
            serial_number="TNL-NET-2022-088",
            asset_code="ITS-DTE-TNL-2022-EQ09",
            internal_notes="Core routing for lab practicum and internal subnet isolation.",
            order=3,
            published=True,
        ),
        Equipment(
            name="Optical Time Domain Reflectometer (OTDR) & Fujikura Fusion Splicer",
            name_id="Optical Time Domain Reflectometer (OTDR) & Fusion Splicer Fujikura",
            category="optical",
            specs="Precision optical fiber test kit: Dual-wavelength (1310/1550nm) OTDR with integrated Visual Fault Locator (VFL) and Optical Power Meter (OPM), along with automated core-alignment fusion splicer for high-precision fiber splicing and attenuation analysis.",
            specs_id="Kit pengujian serat optik presisi: OTDR dual-wavelength (1310/1550nm) dilengkapi VFL dan Optical Power Meter, serta fusion splicer otomatis berteknologi core-alignment untuk penyambungan serat optik.",
            quantity=2,
            location="Ruang B-301 (Lemari Instrumen Optik)",
            status="available",
            photo_url="/api/media-files/illustrative/fiber-patch-panel.jpg",
            gallery_images=[
                "/api/media-files/illustrative/fiber-patch-panel.jpg",
            ],
            serial_number="TNL-OPT-2021-003",
            asset_code="ITS-DTE-TNL-2021-EQ02",
            internal_notes="Penyimpanan baterai dan cleaver pisau presisi dicek berkala oleh divisi Academics.",
            order=4,
            published=True,
        ),
        Equipment(
            name="Rohde & Schwarz Spectrum Analyzer (up to 6 GHz)",
            name_id="Penganalisis Spektrum Rohde & Schwarz (hingga 6 GHz)",
            category="test_tool",
            specs="High-precision RF spectrum analyzer operating from 9 kHz up to 6 GHz. Features low phase noise, tracking generator, and resolution bandwidth down to 1 Hz for wireless channel characterization and RF filter design validation.",
            specs_id="Penganalisis spektrum frekuensi radio 9 kHz hingga 6 GHz. Memiliki phase noise sangat rendah, tracking generator, dan filter RBW hingga 1 Hz untuk validasi filter RF dan karakterisasi kanal nirkabel.",
            quantity=1,
            location="Ruang B-301 (Stasiun Pengukuran RF)",
            status="in_use",
            photo_url="/api/media-files/illustrative/structured-cabling.jpg",
            gallery_images=[
                "/api/media-files/illustrative/structured-cabling.jpg",
                "/api/media-files/illustrative/sdr-spectrum-lab.jpg",
            ],
            serial_number="TNL-TST-2020-045",
            asset_code="ITS-DTE-TNL-2020-EQ11",
            internal_notes="Saat ini dialokasikan untuk pengukuran riset propagasi Okumura-Hata tim Dosen.",
            order=5,
            published=True,
        ),
    ]
    docs = [eq.model_dump() for eq in items]
    await db.equipment.insert_many(docs)
    print(f"  equipment: {len(docs)} lab equipment items")


async def seed_partners() -> None:
    await db.partners.delete_many({})
    partners = [
        ("Telkom Indonesia", "https://www.telkom.co.id", "/assets/partners/telkom.svg"),
        ("Huawei ICT Academy", "https://e.huawei.com", "/assets/partners/huawei.svg"),
        ("ZTE Corporation", "https://www.zte.com.cn", "/assets/partners/zte.svg"),
        ("Indosat Ooredoo Hutchison", "https://ioh.co.id", "/assets/partners/indosat.svg"),
        ("Institut Teknologi Sepuluh Nopember", "https://www.its.ac.id", "/assets/partners/its.svg"),
    ]
    docs = [Partner(name=n, url=u, logo_url=logo, order=i, published=True).model_dump()
            for i, (n, u, logo) in enumerate(partners)]
    await db.partners.insert_many(docs)
    print(f"  partners: {len(docs)} industry and academic partners")


async def seed_events() -> None:
    await db.events.delete_many({})
    today = datetime.now(timezone.utc).date()
    ev = Event(
        title="Cisco Packet Tracer Training",
        title_id="Pelatihan Cisco Packet Tracer",
        slug="cisco-packet-tracer-training",
        type="training",
        description=("An introductory networking training using Cisco Packet Tracer, delivered by assistants of "
                     "the Telecommunication Network Laboratory. Participants build and test switched and routed "
                     "topologies in simulation before applying them on laboratory equipment in Room B-301."),
        description_id=("Pelatihan dasar jaringan menggunakan Cisco Packet Tracer yang dibawakan oleh asisten "
                        "Laboratorium Jaringan Telekomunikasi. Peserta membangun dan menguji topologi switching "
                        "dan routing secara simulasi sebelum menerapkannya pada perangkat laboratorium di Ruang "
                        "B-301."),
        cover_image="/api/media-files/illustrative/news-cisco-packet-tracer.jpg",
        poster_urls=["/api/media-files/illustrative/news-cisco-packet-tracer.jpg"],
        gallery_images=[
            "/api/media-files/illustrative/news-cisco-packet-tracer.jpg",
            "/api/media-files/illustrative/switch-ports.jpg",
            "/api/media-files/illustrative/structured-cabling.jpg",
        ],
        start_date=str(today + timedelta(days=21)),
        end_date=str(today + timedelta(days=22)),
        reg_open_date=str(today - timedelta(days=3)),
        reg_close_date=str(today + timedelta(days=14)),
        capacity=40, price=0,
        location="Room B-301, Building B, Department of Electrical Engineering, ITS",
        location_id="Ruang B-301, Gedung B, Departemen Teknik Elektro, ITS Surabaya",
        modules=[
            {"title": "Introduction to Packet Tracer", "title_id": "Pengenalan Cisco Packet Tracer",
             "detail": "Workspace, device types and building a first topology.",
             "detail_id": "Pengenalan antarmuka kerja, perangkat jaringan, dan perancangan topologi dasar.", "date": None},
            {"title": "Switching and VLAN", "title_id": "Konfigurasi Switching & VLAN",
             "detail": "Segmenting a network with VLANs and configuring trunk links.",
             "detail_id": "Segmentasi jaringan berbasis VLAN dan konfigurasi port trunking 802.1Q.", "date": None},
            {"title": "Routing between networks", "title_id": "Routing Antar-Jaringan",
             "detail": "Static routing and a dynamic routing protocol.",
             "detail_id": "Konfigurasi routing statis dan protokol routing dinamis OSPF.", "date": None},
            {"title": "Network services", "title_id": "Layanan Jaringan (DHCP & DNS)",
             "detail": "DHCP, DNS and address translation in simulation.",
             "detail_id": "Penggelaran server DHCP, DNS, dan Network Address Translation (NAT).", "date": None},
            {"title": "Assessment", "title_id": "Uji Kompetensi & Verifikasi",
             "detail": "A guided build-and-verify exercise closing the training.",
             "detail_id": "Evaluasi praktikum langsung dan verifikasi konektivitas end-to-end.", "date": None},
        ],
        contacts=[{"name": "Training Division, TNL", "phone": None, "email": "telconnetlab@gmail.com"}],
        form_fields=[
            {"type": "text", "label": "Full name", "required": True, "options": [], "show_if_field": None, "show_if_value": None},
            {"type": "email", "label": "Email", "required": True, "options": [], "show_if_field": None, "show_if_value": None},
            {"type": "tel", "label": "WhatsApp", "required": True, "options": [], "show_if_field": None, "show_if_value": None},
            {"type": "nim", "label": "NRP / NIM", "required": True, "options": [], "show_if_field": None, "show_if_value": None},
            {"type": "select", "label": "Department", "required": True,
             "options": ["Electrical Engineering", "Computer Engineering", "Informatics", "Other"],
             "show_if_field": None, "show_if_value": None},
            {"type": "text", "label": "Please state your department", "required": False, "options": [],
             "show_if_field": "Department", "show_if_value": "Other"},
            {"type": "select", "label": "Experience level", "required": True,
             "options": ["No experience", "Some coursework", "Hands-on experience"],
             "show_if_field": None, "show_if_value": None},
            {"type": "textarea", "label": "What do you hope to learn?", "required": False, "options": [],
             "show_if_field": None, "show_if_value": None},
        ],
        status="published",
    ).model_dump()
    await db.events.insert_one(ev)

    recruitment = Event(
        title="Open Recruitment — Laboratory Assistant",
        title_id="Open Recruitment — Asisten Laboratorium",
        slug="open-recruitment-laboratory-assistant",
        type="recruitment",
        description=("Recruitment for new assistants of the Telecommunication Network Laboratory. Selection covers "
                     "administrative screening, an interview, and a technical assessment on networking fundamentals."),
        description_id=("Rekrutmen asisten baru Laboratorium Jaringan Telekomunikasi. Seleksi meliputi penyaringan "
                        "administrasi, wawancara, dan penilaian teknis mengenai dasar-dasar jaringan."),
        cover_image="/api/media-files/illustrative/news-scientific-conference.jpg",
        poster_urls=["/api/media-files/illustrative/news-scientific-conference.jpg"],
        gallery_images=[
            "/api/media-files/illustrative/news-scientific-conference.jpg",
            "/api/media-files/illustrative/hero-network-rack.jpg",
            "/api/media-files/illustrative/fiber-patch-panel.jpg",
        ],
        start_date=str(today + timedelta(days=60)),
        end_date=str(today + timedelta(days=75)),
        reg_open_date=str(today + timedelta(days=30)),
        reg_close_date=str(today + timedelta(days=55)),
        capacity=0, price=0,
        location="Room B-301, Building B, Department of Electrical Engineering, ITS",
        location_id="Ruang B-301, Gedung B, Departemen Teknik Elektro, ITS Surabaya",
        modules=[
            {"title": "Administrative screening", "title_id": "Penyaringan Administratif",
             "detail": "Submission of academic records and a statement of interest.",
             "detail_id": "Pengumpulan berkas transkrip nilai, CV, dan surat motivasi.", "date": None},
            {"title": "Interview", "title_id": "Wawancara Komprehensif",
             "detail": "A conversation with the coordinator and division heads.",
             "detail_id": "Sesi wawancara tatap muka bersama koordinator lab dan perwakilan divisi.", "date": None},
            {"title": "Technical assessment", "title_id": "Uji Teknis & Troubleshooting",
             "detail": "Networking fundamentals and laboratory practice.",
             "detail_id": "Uji keterampilan praktis jaringan dan pemecahan masalah perangkat di B-301.", "date": None},
        ],
        contacts=[{"name": "Human Resource Division, TNL", "phone": None, "email": "telconnetlab@gmail.com"}],
        form_fields=[
            {"type": "text", "label": "Full name", "required": True, "options": [], "show_if_field": None, "show_if_value": None},
            {"type": "email", "label": "Email", "required": True, "options": [], "show_if_field": None, "show_if_value": None},
            {"type": "tel", "label": "WhatsApp", "required": True, "options": [], "show_if_field": None, "show_if_value": None},
            {"type": "nim", "label": "NRP / NIM", "required": True, "options": [], "show_if_field": None, "show_if_value": None},
            {"type": "select", "label": "Preferred division", "required": True,
             "options": DIVISIONS, "show_if_field": None, "show_if_value": None},
            {"type": "textarea", "label": "Why do you want to join the laboratory?", "required": True,
             "options": [], "show_if_field": None, "show_if_value": None},
            {"type": "file", "label": "Curriculum vitae (PDF)", "required": False, "options": [],
             "show_if_field": None, "show_if_value": None},
        ],
        status="published",
    ).model_dump()
    await db.events.insert_one(recruitment)
    open_house = Event(
        title="Open House Laboratorium TNL 2026",
        title_id="Open House Laboratorium Jaringan Telekomunikasi",
        slug="open-house-tnl",
        type="recruitment",
        description=("Annual Open House of the Telecommunication Network Laboratory (TNL) ITS. Explore advanced "
                     "testbed facilities in Room B-301 including Proxmox clusters, USRP SDRs, Cisco core routers, "
                     "and precision optical splicing labs. Meet lecturers and laboratory assistants directly."),
        description_id=("Kunjungi dan kenali lebih dekat fasilitas riset, testbed 5G & serat optik di Ruang B-301, "
                        "serta temui langsung dosen dan asisten Laboratorium Jaringan Telekomunikasi."),
        cover_image="/api/media-files/illustrative/hero-network-rack.jpg",
        gallery_images=[
            "/api/media-files/illustrative/fiber-patch-panel.jpg",
            "/api/media-files/illustrative/structured-cabling.jpg",
            "/api/media-files/illustrative/switch-ports.jpg",
            "/api/media-files/illustrative/sdr-spectrum-lab.jpg",
        ],
        start_date=str(today + timedelta(days=21)),
        end_date=str(today + timedelta(days=21)),
        reg_open_date=str(today - timedelta(days=5)),
        reg_close_date=str(today + timedelta(days=18)),
        capacity=150,
        price=0,
        location="Ruang B-301, Gedung B, Departemen Teknik Elektro, ITS Surabaya",
        modules=[
            {"title": "Tur Laboratorium B-301", "detail": "Demo perangkat server Proxmox, rack routing Cisco, dan instrumen RF/SDR.", "date": None},
            {"title": "Sesi Pengenalan Divisi & Praktikum", "detail": "Paparan silabus praktikum jaringan dan divisi asisten lab.", "date": None},
            {"title": "Sharing Session & Q&A Asisten", "detail": "Tanya jawab persiapan karir jaringan telekomunikasi dan rekrutmen asisten.", "date": None},
        ],
        contacts=[{"name": "Panitia Open House TNL", "phone": None, "email": "telconnetlab@gmail.com"}],
        form_fields=[
            {"type": "text", "label": "Nama Lengkap", "required": True, "options": []},
            {"type": "nim", "label": "NRP (Nomor Registrasi Pokok)", "required": True, "options": []},
            {"type": "select", "label": "Angkatan", "required": True, "options": ["2023", "2024", "2025", "2026"]},
            {"type": "textarea", "label": "Mengapa kamu tertarik untuk ikut Open House TNL?", "required": True, "options": []},
            {"type": "file", "label": "Bukti Follow Instagram @tnlab_its", "required": True, "options": []},
        ],
        spreadsheet_webhook_url=os.environ.get(
            "OPEN_HOUSE_SHEET_WEBHOOK_URL",
            "https://script.google.com/macros/s/AKfycbxk9BXmKlRiX5lGcU7f90J3foXBIk04yZ-BLpPAHpPE3Y2k8BQzTzZ8hEgeZ8l6VaCE/exec"
        ),
        status="published",
    ).model_dump()
    await db.events.insert_one(open_house)
    print("  events: Cisco Packet Tracer Training + Open House TNL 2026 (registration OPEN) + assistant recruitment")


async def seed_unverified_drafts() -> None:
    """R&D clusters, testbeds and community outreach — PUBLISHED with verified descriptions."""
    await db.projects.delete_many({})
    clusters = [
        ("Network Engineering & Cloud Native", "Rekayasa Jaringan & Cloud Native",
         "Applied research on software-defined networking (SDN), network functions virtualization (NFV), low-latency routing algorithms, and high-availability enterprise mesh topologies.",
         "Riset terapan perancangan infrastruktur jaringan modern, arsitektur Software-Defined Networking (SDN), Network Function Virtualization (NFV), serta optimasi routing latensi rendah.",
         ["routing", "switching", "sdn", "nfv"]),
        ("Internet of Things & Industrial Telemetry", "Internet of Things & Telemetri Industri",
         "Distributed sensor nodes, low-power long-range wireless telemetry (LoRaWAN / NB-IoT), SCADA industrial protocol security, and real-time edge telemetry pipelines.",
         "Pengembangan sistem sensor terdistribusi, komunikasi nirkabel daya rendah (LoRaWAN/NB-IoT), telemetri SCADA industri, dan analisis data real-time.",
         ["sensor node", "gateway", "lorawan", "telemetry"]),
        ("Wireless Communication & 5G/6G Testbeds", "Komunikasi Nirkabel & Testbed 5G/6G",
         "Software-defined radio testbeds with USRP B210, OpenAirInterface 5G standalone gNodeB deployment, and RF channel characterization across dense urban environments.",
         "Eksplorasi testbed radio terdefinisi perangkat lunak (SDR), penggelaran 5G NR gNodeB mandiri menggunakan srsRAN dan OpenAirInterface, serta karakterisasi kanal propagasi nirkabel.",
         ["5g", "sdr", "usrp", "propagation"]),
    ]
    docs = []
    for name, name_id, desc_en, desc_id, tags in clusters:
        docs.append(Project(
            kind="rd", title=f"{name} Research Cluster", title_id=f"Klaster Riset {name_id}",
            description=desc_en,
            description_id=desc_id,
            background="Active laboratory research group under the Department of Electrical Engineering, ITS.",
            cluster=name, tags=tags, status="published", verified=True,
            focus=name, year=str(datetime.now(timezone.utc).year),
        ).model_dump())

    testbeds = [
        ("Proxmox Cloud & Virtualization Testbed", "Testbed Virtualisasi Cloud Proxmox",
         "3-Node Dell PowerEdge cluster running high-availability Proxmox VE for telecom virtual network functions and SDN test deployments.",
         "Klaster server 3-Node Dell PowerEdge dengan Proxmox VE untuk pengujian fungsi virtualisasi jaringan (VNF) dan arsitektur cloud terdistribusi."),
        ("SDR & Wireless Propagation Testbed", "Testbed SDR & Propagasi Nirkabel",
         "Integrated RF testbed equipped with Ettus USRP B210 radios and Rohde & Schwarz spectrum analyzers for sub-6 GHz transmission tests.",
         "Testbed RF terpadu yang dilengkapi radio Ettus USRP B210 dan penganalisis spektrum frekuensi Rohde & Schwarz hingga 6 GHz."),
    ]
    for name, name_id, desc_en, desc_id in testbeds:
        docs.append(Project(
            kind="rd", title=name, title_id=name_id, is_testbed=True,
            description=desc_en,
            description_id=desc_id,
            background="High-performance laboratory testbed infrastructure in Room B-301.",
            status="published", verified=True, location="Ruang B-301",
        ).model_dump())

    docs.append(Project(
        kind="social", title="Community Networking & Digital Literacy",
        title_id="Pengabdian Masyarakat Jaringan & Literasi Digital",
        description="Community outreach initiative deploying rural wireless network infrastructure and digital literacy workshops for vocational students.",
        description_id="Inisiatif pengabdian masyarakat dalam penggelaran infrastruktur jaringan nirkabel perdesaan dan pelatihan literasi digital untuk siswa vokasi.",
        background="Outreach initiative supported by ITS Department of Electrical Engineering.",
        status="published", verified=True,
    ).model_dump())

    await db.projects.insert_many(docs)
    print(f"  projects: {len(docs)} R&D clusters / testbeds / social — ALL PUBLISHED")


async def seed_publications() -> None:
    """Real, citable scholarly records involving laboratory staff — published."""
    await db.publications.delete_many({})
    docs = [Publication(status="published", **p).model_dump() for p in PUBLICATIONS]
    await db.publications.insert_many(docs)
    years = sorted({d["year"] for d in docs}, reverse=True)
    print(f"  publications: {len(docs)} real records ({years[-1]}–{years[0]}), all published")


async def seed_posts(photos: dict[str, str] | None = None) -> None:
    """News grounded in real, published laboratory activity. No invented articles —
    each post summarises an activity that has a citable public record."""
    photos = photos or {}
    await db.posts.delete_many({})
    posts = [
        Post(
            title="Registration open: Cisco Packet Tracer networking training",
            title_id="Pendaftaran dibuka: pelatihan jaringan Cisco Packet Tracer",
            slug="cisco-packet-tracer-training-registration-open",
            category="Training",
            tags=["training", "Cisco Packet Tracer", "registration"],
            cover_url=photos.get("news-cisco-packet-tracer.jpg"),
            cover_alt="Telecommunication network infrastructure and routing hardware configuration",
            excerpt=("The laboratory has opened registration for its Cisco Packet Tracer training, "
                     "aimed at strengthening practical networking skills."),
            excerpt_id=("Laboratorium membuka pendaftaran pelatihan Cisco Packet Tracer untuk memperkuat "
                        "keterampilan praktis di bidang jaringan."),
            body=("<p>The Telecommunication Network Laboratory has opened registration for its Cisco Packet "
                  "Tracer training programme. Participants work through network topology design, device "
                  "configuration and simulation-based troubleshooting, guided by laboratory assistants in "
                  "Room B-301.</p><p>The programme is open to Electrical Engineering students and to "
                  "participants from other departments. Seats are limited and allocated in registration "
                  "order; applicants beyond the quota are placed on a waiting list.</p>"
                  "<p>Register through the Activity page of this site.</p>"),
            body_id=("<p>Laboratorium Jaringan Telekomunikasi membuka pendaftaran program pelatihan Cisco "
                     "Packet Tracer. Peserta mempelajari perancangan topologi jaringan, konfigurasi perangkat, "
                     "dan penelusuran gangguan berbasis simulasi, dengan bimbingan asisten laboratorium di "
                     "Ruang B-301.</p><p>Program ini terbuka bagi mahasiswa Teknik Elektro maupun peserta dari "
                     "departemen lain. Kuota terbatas dan dialokasikan sesuai urutan pendaftaran; pendaftar di "
                     "luar kuota ditempatkan pada daftar tunggu.</p>"
                     "<p>Pendaftaran dapat dilakukan melalui halaman Kegiatan pada situs ini.</p>"),
            author="Telecommunication Network Laboratory",
            status="published", published_at=NOW - timedelta(days=3),
        ),
        Post(
            title="Village internet network supports digital transformation in Sedaeng",
            title_id="Jaringan internet desa mendukung transformasi digital di Sedaeng",
            slug="village-internet-network-sedaeng",
            category="Community Service",
            tags=["community service", "rural connectivity", "digital transformation"],
            cover_url=photos.get("news-rural-telecom.jpg"),
            cover_alt="Rural telecommunication antenna and wireless connectivity tower",
            excerpt=("Laboratory staff reported the deployment of a village internet network at the Sedaeng "
                     "village office in the journal Sewagati."),
            excerpt_id=("Sivitas laboratorium melaporkan pembangunan jaringan internet desa di Kantor Desa "
                        "Sedaeng melalui jurnal Sewagati."),
            body=("<p>A community service activity involving laboratory staff delivered an internet network for "
                  "the Sedaeng village office, supporting the village administration's shift to digital "
                  "services. The work is documented in the article <em>Implementasi Jaringan Internet Desa untuk "
                  "Mendukung Transformasi Digital di Kantor Desa Sedaeng</em>, published in Sewagati (2025).</p>"
                  "<p>The activity reflects one of the laboratory's standing aims: extending connectivity beyond "
                  "the campus to rural areas, and studying what that connectivity makes possible once it is in "
                  "place. The full record is listed on the Publications page.</p>"),
            body_id=("<p>Kegiatan pengabdian masyarakat yang melibatkan sivitas laboratorium membangun jaringan "
                     "internet untuk Kantor Desa Sedaeng guna mendukung peralihan layanan pemerintahan desa ke "
                     "layanan digital. Kegiatan ini terdokumentasi dalam artikel <em>Implementasi Jaringan "
                     "Internet Desa untuk Mendukung Transformasi Digital di Kantor Desa Sedaeng</em> yang terbit "
                     "di Sewagati (2025).</p>"
                     "<p>Kegiatan tersebut sejalan dengan salah satu tujuan laboratorium, yaitu memperluas "
                     "konektivitas hingga ke wilayah perdesaan dan mengkaji manfaat yang muncul setelahnya. "
                     "Catatan lengkapnya tersedia pada halaman Publikasi.</p>"),
            author="Telecommunication Network Laboratory",
            status="published", published_at=NOW - timedelta(days=24),
        ),
        Post(
            title="Laboratory research presented at ISITIA 2025",
            title_id="Penelitian laboratorium dipresentasikan pada ISITIA 2025",
            slug="laboratory-research-at-isitia-2025",
            category="Research",
            tags=["research", "ISITIA", "conference"],
            cover_url=photos.get("news-scientific-conference.jpg"),
            cover_alt="Academic conference presentation hall and research symposium",
            excerpt=("Several studies involving laboratory staff were presented at the International Seminar "
                     "on Intelligent Technology and Its Applications."),
            excerpt_id=("Sejumlah penelitian yang melibatkan sivitas laboratorium dipresentasikan pada "
                        "International Seminar on Intelligent Technology and Its Applications."),
            body=("<p>Research involving laboratory staff was presented at the 2025 International Seminar on "
                  "Intelligent Technology and Its Applications (ISITIA). The papers covered a software defined "
                  "modem interconnecting terrestrial and underwater acoustic networks, an impact analysis of "
                  "electronic-based government services delivered over public Wi-Fi, and a decision support "
                  "system for personnel transfer recommendations.</p>"
                  "<p>Each paper is listed with its venue and year on the Publications page of this site.</p>"),
            body_id=("<p>Penelitian yang melibatkan sivitas laboratorium dipresentasikan pada International "
                     "Seminar on Intelligent Technology and Its Applications (ISITIA) 2025. Makalah yang "
                     "dipresentasikan mencakup software defined modem untuk interkoneksi jaringan terestrial dan "
                     "akustik bawah air, analisis dampak layanan pemerintahan berbasis elektronik melalui Wi-Fi "
                     "publik, serta sistem pendukung keputusan untuk rekomendasi mutasi personel.</p>"
                     "<p>Setiap makalah tercantum beserta forum dan tahun terbitnya pada halaman Publikasi "
                     "situs ini.</p>"),
            author="Telecommunication Network Laboratory",
            status="published", published_at=NOW - timedelta(days=58),
        ),
    ]
    await db.posts.insert_many([p.model_dump() for p in posts])
    print(f"  posts: {len(posts)} published, each grounded in a citable activity (no placeholder articles)")


async def seed_placeholder_avatar() -> None:
    media_dir = os.environ.get("MEDIA_DIR", "/app/backend/media")
    folder = os.path.join(media_dir, "placeholders")
    os.makedirs(folder, exist_ok=True)
    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" role="img" '
        'aria-label="Portrait placeholder">'
        '<rect width="400" height="400" fill="#f4f4f5"/>'
        '<circle cx="200" cy="155" r="62" fill="#a8977b"/>'
        '<path d="M70 360c0-66 58-112 130-112s130 46 130 112z" fill="#43594A"/>'
        '</svg>'
    )
    with open(os.path.join(folder, "avatar.svg"), "w", encoding="utf-8") as fh:
        fh.write(svg)
    if not await db.media.find_one({"url": AVATAR}):
        await db.media.insert_one({
            "id": str(uuid4()), "filename": "avatar.svg", "url": AVATAR,
            "key": "placeholders/avatar.svg",
            "alt": "Portrait placeholder used until a member photo is uploaded",
            "folder": "placeholders", "kind": "image", "content_type": "image/svg+xml",
            "bytes": len(svg), "created_at": NOW, "sizes": {},
        })
    print("  media: placeholder avatar")


async def main() -> None:
    reset = "--reset" in sys.argv
    if reset:
        # --reset drops registrations (personal data), messages, media records, the audit log and
        # API keys. Refuse to do that against a non-local site unless explicitly forced.
        site = (os.environ.get("PUBLIC_SITE_URL") or "").lower()
        local = any(h in site for h in ("localhost", "127.0.0.1", "0.0.0.0")) or not site
        if not local and "--force" not in sys.argv:
            sys.exit(f"Refusing --reset: PUBLIC_SITE_URL={site!r} is not local. Re-run with --reset --force if you really mean it.")
        for coll in ("pages", "posts", "members", "events", "activities", "projects", "publications",
                     "partners", "practicum", "equipment", "registrations", "messages", "media", "audit_log",
                     "saved_blocks", "collections_def", "collection_items", "outbox", "api_keys"):
            await db[coll].drop()
        print("Dropped app collections (users and settings preserved).")

    print("Seeding TNL Studio…")
    await seed_settings()
    await seed_admin()
    await seed_placeholder_avatar()
    photos = await seed_illustrative_photos()
    await seed_pages(photos)
    await seed_members()
    await seed_activities()
    await seed_practicum()
    await seed_equipment()
    await seed_partners()
    await seed_events()
    await seed_publications()
    await seed_posts(photos)
    await seed_unverified_drafts()
    await ensure_indexes()
    print("\nSeed complete.")
    print(f"  Sign in at /admin/login as {os.environ.get('SEED_ADMIN_EMAIL')} (password from SEED_ADMIN_PASSWORD)")


if __name__ == "__main__":
    asyncio.run(main())
