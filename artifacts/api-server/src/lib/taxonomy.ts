export const SECTORS = [
  { id: "government", label: "Government" },
  { id: "private-tech", label: "Private — Technology" },
  { id: "private-banking", label: "Private — Banking & Finance" },
  { id: "private-engineering", label: "Private — Engineering" },
  { id: "private-healthcare", label: "Private — Healthcare" },
  { id: "private-education", label: "Private — Education" },
  { id: "private-sales-marketing", label: "Private — Sales & Marketing" },
  { id: "private-media-creative", label: "Private — Media & Creative" },
  {
    id: "private-operations-admin",
    label: "Private — Operations & Admin",
  },
  { id: "ngo-nonprofit", label: "NGO / Non-profit" },
  { id: "remote-international", label: "Remote / International" },
  { id: "internships-fresh", label: "Internships / Fresh Graduate" },
];

export const CATEGORIES: Record<string, string[]> = {
  government: [
    "Federal (FPSC)",
    "Provincial",
    "Testing Services (NTS/PTS/OTS/ETEA)",
    "Departments",
  ],
  "private-tech": [
    "Software Development",
    "Data / AI / Machine Learning",
    "DevOps / Cloud",
    "Cybersecurity",
    "QA / Testing",
    "UI/UX Design",
    "Product Management",
  ],
  "private-banking": [
    "Banking Operations",
    "Accounting & Audit",
    "Investment & Treasury",
    "Fintech / Digital Banking",
  ],
  "private-engineering": [
    "Civil",
    "Mechanical",
    "Electrical",
    "Chemical",
    "Petroleum",
    "Energy",
  ],
  "private-healthcare": ["Medical", "Pharmacy", "Nursing", "Hospital Admin"],
  "private-education": [
    "School Teaching",
    "University Faculty",
    "Training & Tutoring",
    "Education Admin",
  ],
  "private-sales-marketing": [
    "Digital Marketing",
    "Field Sales",
    "Business Development",
    "Content & Copywriting",
  ],
  "private-media-creative": [
    "Journalism",
    "Graphic Design",
    "Video & Animation",
    "Social Media Management",
  ],
  "private-operations-admin": [
    "HR & Recruitment",
    "Customer Service",
    "Logistics",
    "Office Administration",
  ],
  "ngo-nonprofit": ["Program Management", "Field Work", "Fundraising"],
  "remote-international": ["Remote Full-time", "Remote Part-time", "Overseas"],
  "internships-fresh": ["Internship", "Graduate Trainee", "Entry Level"],
};

// Map Adzuna category tags to our sector taxonomy
export function mapAdzunaCategory(adzunaCategory: string): {
  sector: string;
  category: string;
} {
  const cat = adzunaCategory.toLowerCase();

  if (
    cat.includes("it") ||
    cat.includes("software") ||
    cat.includes("tech") ||
    cat.includes("engineering/software") ||
    cat.includes("data") ||
    cat.includes("product")
  ) {
    return { sector: "private-tech", category: "Software Development" };
  }
  if (cat.includes("banking") || cat.includes("finance") || cat.includes("accounting")) {
    return { sector: "private-banking", category: "Banking Operations" };
  }
  if (cat.includes("engineering") || cat.includes("manufacturing")) {
    return { sector: "private-engineering", category: "Civil" };
  }
  if (cat.includes("health") || cat.includes("medical") || cat.includes("pharma")) {
    return { sector: "private-healthcare", category: "Medical" };
  }
  if (cat.includes("education") || cat.includes("teach")) {
    return { sector: "private-education", category: "School Teaching" };
  }
  if (cat.includes("marketing") || cat.includes("sales") || cat.includes("pr")) {
    return { sector: "private-sales-marketing", category: "Digital Marketing" };
  }
  if (cat.includes("media") || cat.includes("creative") || cat.includes("design")) {
    return { sector: "private-media-creative", category: "Graphic Design" };
  }
  if (cat.includes("hr") || cat.includes("admin") || cat.includes("logistics")) {
    return { sector: "private-operations-admin", category: "HR & Recruitment" };
  }
  if (cat.includes("ngo") || cat.includes("nonprofit") || cat.includes("charity")) {
    return { sector: "ngo-nonprofit", category: "Program Management" };
  }
  if (cat.includes("graduate") || cat.includes("intern") || cat.includes("fresh")) {
    return { sector: "internships-fresh", category: "Internship" };
  }

  return { sector: "private-operations-admin", category: "Office Administration" };
}

export const LOCATIONS = [
  "Karachi",
  "Lahore",
  "Islamabad",
  "Rawalpindi",
  "Faisalabad",
  "Multan",
  "Peshawar",
  "Quetta",
  "Remote",
  "Other",
];

export const EXPERIENCE_LEVELS = [
  { id: "fresh", label: "Fresh" },
  { id: "1-3", label: "1–3 years" },
  { id: "3-5", label: "3–5 years" },
  { id: "5+", label: "5+ years" },
  { id: "senior", label: "Senior" },
];

export const JOB_TYPES = [
  { id: "full-time", label: "Full-time" },
  { id: "part-time", label: "Part-time" },
  { id: "contract", label: "Contract" },
  { id: "internship", label: "Internship" },
];
