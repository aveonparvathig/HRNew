// AUTO-GENERATED from the Django app's cms_spec.py - do not edit by hand.
// Regenerate with scratchpad/export_cms_spec.py
export const CMS_SPEC: any = {
 "cover_stats": [
  {
   "value": "16",
   "label": "Chapters"
  },
  {
   "value": "25+",
   "label": "Functional Modules"
  },
  {
   "value": "275+",
   "label": "Features"
  },
  {
   "value": "1000+",
   "label": "Reports"
  }
 ],
 "document_control": [
  [
   "Document Title",
   "Aveon Complete Campus Management System (CMS ERP) — Product Features & Functional Specifications"
  ],
  [
   "Version",
   "2026 (Release 1.0)"
  ],
  [
   "Document Type",
   "Product Catalogue & Solution Document"
  ],
  [
   "Classification",
   "Confidential — For Institutional Evaluation"
  ],
  [
   "Prepared By",
   "Aveon Infotech Private Limited"
  ],
  [
   "Intended Audience",
   "Principals, Secretaries, Governing Trusts, Registrars, Controllers of Examinations, IT Teams & Evaluation Committees"
  ],
  [
   "Purpose",
   "Product demonstrations, tenders, RFP responses and institutional presentations"
  ],
  [
   "Jurisdiction",
   "Coimbatore, Tamil Nadu, India"
  ]
 ],
 "purpose": "This document presents the complete functional scope of the Aveon Campus Management System (CMS ERP). Each module is described using a consistent structure — overview, objectives, key features, business benefits, workflow, user roles, reports and dashboards, integrations and, where applicable, compliance support — so that evaluators can assess capability, fit and value with clarity and confidence.",
 "chapters": [
  {
   "num": "01",
   "title": "Digital Campus Ecosystem",
   "intro": [],
   "narrative": [
    {
     "heading": "What is a Digital Campus?",
     "body": [
      "A Digital Campus is an institution in which every function — academic, administrative and financial — operates on a single, connected platform rather than a patchwork of registers, spreadsheets and standalone tools. Information is captured once, at its source, and flows automatically to everyone who needs it. The Aveon CMS ERP is the engine of that transformation: it unifies the entire institution into one intelligent, real-time system of record."
     ],
     "cards": []
    },
    {
     "heading": "Why Digital Transformation?",
     "body": [
      "Institutions today face rising enrolment, tighter regulation, demanding accreditation cycles and stakeholders who expect instant, transparent service. Manual and fragmented systems cannot keep pace — they duplicate effort, delay decisions and put compliance at risk. Digital transformation replaces that friction with automation, accuracy and insight, freeing faculty and staff to focus on education rather than paperwork."
     ],
     "cards": []
    },
    {
     "heading": "Complete Digital Campus Architecture",
     "body": [
      "The Aveon architecture is organised around the people it serves and the lifecycles they follow. A unified data core — the Student Information System, HR master and financial ledger — sits at the centre, surrounded by functional modules for academics, examinations, finance, administration, development, compliance and communication, all surfaced through web and mobile experiences and protected by an enterprise security layer."
     ],
     "cards": [
      {
       "title": "Student Lifecycle",
       "desc": "Enquiry → Admission → Enrolment → Academics → Attendance → Assessment → Examination → Results → Graduation → Alumni."
      },
      {
       "title": "Faculty Lifecycle",
       "desc": "Recruitment → Onboarding → Allocation & Workload → Teaching & Assessment → Appraisal → Development → Payroll."
      },
      {
       "title": "Parent Engagement",
       "desc": "Real-time visibility of attendance, academic progress, fees and communication through the dedicated parent app and portal."
      },
      {
       "title": "Management Dashboard",
       "desc": "A live, institution-wide command view of admissions, academics, finance, HR, compliance and KPIs for confident decision-making."
      }
     ]
    },
    {
     "heading": "Campus Digital Workflow",
     "body": [
      "Every transaction in the campus — an admission, a class, an exam, a fee, a leave request — becomes a digital event that updates the shared record and, where relevant, triggers a notification, an approval or an analytic. The result is an institution that runs as one connected organism. Chapter 16 presents the complete end-to-end ecosystem flow that ties these modules together."
     ],
     "cards": []
    }
   ],
   "flow": [],
   "callout": [],
   "modules": []
  },
  {
   "num": "02",
   "title": "Student Lifecycle Management",
   "intro": [
    "The student lifecycle is the backbone of every institution — from the first enquiry through enrolment, day-to-day academics and, ultimately, graduation. This chapter details the modules that capture and govern that journey as a single, connected record: Admission Management, the Student Information System, Academic Management, Timetable Management and Attendance Management."
   ],
   "narrative": [],
   "flow": [],
   "callout": [],
   "modules": [
    {
     "num": "2.1",
     "title": "Admission Management",
     "overview": "Admission Management digitises the entire prospect-to-student journey — from the first enquiry to a confirmed, fee-paid enrolment. It replaces disconnected enquiry registers, manual application forms and spreadsheet-based merit lists with a single online pipeline that captures every lead, tracks every application and converts approved candidates directly into student records with zero re-keying.",
     "objectives": [
      "Provide a paperless, online admission experience for applicants and staff.",
      "Capture and nurture every enquiry so no prospective student is lost.",
      "Enforce a transparent, rule-based selection and merit process.",
      "Convert approved applicants into the Student Information System automatically."
     ],
     "features": [
      "Online Admission Portal",
      "Lead & Enquiry Management",
      "Application Tracking",
      "Online Document Upload",
      "Merit List Generation",
      "Admission Workflow",
      "Candidate Evaluation",
      "Scholarship Management",
      "Online Fee Payment",
      "Student Registration",
      "Student ID Generation",
      "Certificate Verification",
      "Bulk Student Import",
      "Student Promotion",
      "Transfer Certificate (TC)",
      "Bonafide Certificate",
      "Migration Certificate"
     ],
     "benefits": [
      "Higher conversion through structured lead follow-up and reminders.",
      "Faster admission cycles with online forms, document upload and payment.",
      "Auditable, bias-free merit lists generated from defined criteria.",
      "Zero duplicate data entry — approved candidates flow straight to SIS.",
      "Real-time visibility of the admission funnel for management."
     ],
     "workflow": [
      "Prospect submits an online enquiry or application.",
      "Counsellor captures and tracks the lead through defined stages.",
      "Applicant uploads documents and pays the application fee online.",
      "Applications are screened and evaluated against admission criteria.",
      "Merit / selection lists are generated and communicated.",
      "Admission is approved and the offer is issued.",
      "Candidate record is converted into a student profile with ID generation."
     ],
     "roles": [
      [
       "System Administrator",
       "Configures the module, manages master data, roles and workflow rules."
      ],
      [
       "Admission Officer / Counsellor",
       "Manages enquiries, applications and applicant communication."
      ],
      [
       "Registrar",
       "Owns records, approvals, certificates and statutory outputs."
      ],
      [
       "Principal / Director",
       "Reviews institution-wide status, approvals and analytics dashboards."
      ],
      [
       "Applicant",
       "Applies online, uploads documents and pays fees."
      ]
     ],
     "reports": [
      "Enquiry and lead-source funnel analysis.",
      "Application status and conversion reports.",
      "Category / quota-wise admission summaries.",
      "Merit lists and selection registers.",
      "Admission fee collection reconciliation."
     ],
     "integrations": [
      "Payment gateway for application and admission fees.",
      "SMS / WhatsApp / Email for applicant communication.",
      "Student Information System for candidate conversion.",
      "Finance module for fee posting."
     ],
     "compliance": [
      "Category / reservation-based admission tracking for regulatory reporting.",
      "Auditable admission trail for AICTE / University scrutiny."
     ]
    },
    {
     "num": "2.2",
     "title": "Student Information System (SIS)",
     "overview": "The Student Information System is the single, authoritative record for every student in the institution. It consolidates personal, academic, financial, disciplinary and health information into one 360-degree profile that every other module reads from and writes to — ensuring one version of the truth across the entire campus.",
     "objectives": [
      "Maintain a unified, lifelong student master record.",
      "Centralise documents, academic history and identity artefacts.",
      "Serve as the trusted data source for all downstream modules.",
      "Enable secure student self-service for records and certificates."
     ],
     "features": [
      "Complete Student Profile",
      "Academic History",
      "Parent Information",
      "Medical Information",
      "Attendance History",
      "Discipline Records",
      "Hostel Details",
      "Transport Details",
      "Fee History",
      "Digital Student Profile",
      "Student Life Cycle Management",
      "ID Card Generation",
      "Transfer Certificate",
      "Migration Certificate",
      "Bonafide Certificate"
     ],
     "benefits": [
      "Eliminates data silos with one shared student record.",
      "Instant retrieval of any student's complete history.",
      "Self-service certificates reduce administrative load.",
      "Accurate, audit-ready data for accreditation and audits."
     ],
     "workflow": [
      "Student master is created on admission confirmation.",
      "Personal, parent, medical and academic data are captured.",
      "Documents are uploaded and verified against a checklist.",
      "Identity card and enrolment number are generated.",
      "Records are maintained and updated through the lifecycle.",
      "Certificates (TC, Migration, Bonafide) are issued on request."
     ],
     "roles": [
      [
       "Registrar",
       "Owns records, approvals, certificates and statutory outputs."
      ],
      [
       "System Administrator",
       "Configures the module, manages master data, roles and workflow rules."
      ],
      [
       "Faculty",
       "Executes day-to-day academic transactions and updates records."
      ],
      [
       "Student",
       "Self-service access to personal records, requests and payments."
      ],
      [
       "Parent / Guardian",
       "Views progress, attendance, fees and receives notifications."
      ]
     ],
     "reports": [
      "Student directory and demographic reports.",
      "Document completeness and verification status.",
      "Certificate issuance register.",
      "Student lifecycle and status reports."
     ],
     "integrations": [
      "Admission module (record creation).",
      "Academic, Examination and Finance modules.",
      "Library, Hostel and Transport for allocation.",
      "Mobile apps and student portal."
     ],
     "compliance": []
    },
    {
     "num": "2.3",
     "title": "Academic Management",
     "overview": "Academic Management defines and governs the institution's academic structure — programs, departments, semesters, courses, curriculum and faculty allocation. It provides the framework on which teaching, assessment and outcome measurement operate, with full support for CBCS and modern elective-driven curricula.",
     "objectives": [
      "Model the complete academic hierarchy of the institution.",
      "Administer CBCS, electives and value-added courses.",
      "Publish academic calendars and govern the academic year.",
      "Allocate faculty and manage teaching workload."
     ],
     "features": [
      "Academic Calendar",
      "Program Management",
      "Department Management",
      "Semester Management",
      "Batch Management",
      "Course Management",
      "Subject Management",
      "Curriculum Management",
      "CBCS",
      "Choice Based Electives",
      "Open Electives",
      "Fast Track Courses",
      "Value Added Courses",
      "Skill Development Courses",
      "Lesson Plan",
      "Teaching Plan",
      "Syllabus Coverage",
      "Faculty Workload",
      "Faculty Allocation"
     ],
     "benefits": [
      "A single, structured academic backbone for all operations.",
      "Flexible support for choice-based and interdisciplinary curricula.",
      "Transparent faculty allocation and balanced workload.",
      "Consistent academic calendar visible to all stakeholders."
     ],
     "workflow": [
      "Define programs, departments and academic regulations.",
      "Configure semesters, sections and batches.",
      "Build curriculum, courses and subject mapping.",
      "Open electives and value-added course registrations.",
      "Allocate faculty and publish the academic calendar.",
      "Monitor syllabus coverage through the term."
     ],
     "roles": [
      [
       "Registrar",
       "Owns records, approvals, certificates and statutory outputs."
      ],
      [
       "Head of Department",
       "Manages department-level allocation, approvals and monitoring."
      ],
      [
       "Faculty",
       "Executes day-to-day academic transactions and updates records."
      ],
      [
       "Principal / Director",
       "Reviews institution-wide status, approvals and analytics dashboards."
      ],
      [
       "Student",
       "Self-service access to personal records, requests and payments."
      ]
     ],
     "reports": [
      "Curriculum and course structure reports.",
      "Elective enrolment and allocation reports.",
      "Faculty workload and allocation summaries.",
      "Syllabus coverage and academic calendar reports."
     ],
     "integrations": [
      "Examination and OBE modules.",
      "Timetable and LMS.",
      "Student Information System.",
      "Faculty portal."
     ],
     "compliance": [
      "CBCS-compliant curriculum structuring.",
      "Outcome-ready course mapping for NBA."
     ]
    },
    {
     "num": "2.4",
     "title": "Timetable Management",
     "overview": "Timetable Management automates the creation of clash-free master, faculty and student timetables while optimising the use of classrooms and laboratories. Intelligent conflict detection eliminates the manual effort and errors of spreadsheet scheduling and adapts instantly to substitutions.",
     "objectives": [
      "Generate optimised, conflict-free timetables automatically.",
      "Balance classroom, laboratory and faculty utilisation.",
      "Handle substitutions and ad-hoc changes with ease.",
      "Publish personalised schedules to every stakeholder."
     ],
     "features": [
      "Master Timetable",
      "Faculty Timetable",
      "Student Timetable",
      "Classroom Allocation",
      "Laboratory Scheduling",
      "Smart Conflict Detection",
      "Timetable Publishing",
      "Mobile Timetable"
     ],
     "benefits": [
      "Hours of manual scheduling reduced to minutes.",
      "Zero double-booking of faculty, rooms or labs.",
      "Instant substitution management on faculty absence.",
      "Personalised, always-current timetables on mobile."
     ],
     "workflow": [
      "Define periods, rooms, labs and faculty availability.",
      "Set course and faculty constraints.",
      "Auto-generate the master timetable with conflict checks.",
      "Review and resolve any flagged conflicts.",
      "Publish faculty and student timetables.",
      "Manage substitutions and republish as needed."
     ],
     "roles": [
      [
       "Head of Department",
       "Manages department-level allocation, approvals and monitoring."
      ],
      [
       "System Administrator",
       "Configures the module, manages master data, roles and workflow rules."
      ],
      [
       "Faculty",
       "Executes day-to-day academic transactions and updates records."
      ],
      [
       "Student",
       "Self-service access to personal records, requests and payments."
      ]
     ],
     "reports": [
      "Master, faculty and student timetable sheets.",
      "Room and lab utilisation reports.",
      "Substitution and adjustment logs."
     ],
     "integrations": [
      "Academic Management and Attendance.",
      "Faculty and student portals.",
      "Mobile applications."
     ],
     "compliance": []
    },
    {
     "num": "2.5",
     "title": "Attendance Management",
     "overview": "Attendance Management captures student presence accurately across multiple modes — hour-wise, daily, biometric, RFID, QR and face recognition — and automatically alerts parents and flags shortages. It converts a routine clerical task into a real-time engagement and compliance tool.",
     "objectives": [
      "Capture attendance quickly and accurately across modes.",
      "Automate shortage detection and parent notification.",
      "Provide reliable attendance data for examinations eligibility.",
      "Deliver actionable attendance analytics to faculty and management."
     ],
     "features": [
      "Hour-wise Attendance",
      "Daily Attendance",
      "Online Attendance",
      "Attendance Correction Workflow",
      "Parent Notifications",
      "Attendance Analytics",
      "Biometric Integration",
      "RFID Attendance",
      "QR Attendance",
      "Face Recognition",
      "Geo Attendance"
     ],
     "benefits": [
      "Real-time visibility of presence across the campus.",
      "Automatic parent alerts improve engagement and accountability.",
      "Early identification of at-risk, low-attendance students.",
      "Accurate eligibility data for examination and internal marks."
     ],
     "workflow": [
      "Configure attendance mode and device integration.",
      "Faculty or device captures attendance per session.",
      "System aggregates hour-wise and daily attendance.",
      "Shortage thresholds are evaluated automatically.",
      "Parents and students receive notifications.",
      "Analytics and shortage reports are published."
     ],
     "roles": [
      [
       "Faculty",
       "Executes day-to-day academic transactions and updates records."
      ],
      [
       "Head of Department",
       "Manages department-level allocation, approvals and monitoring."
      ],
      [
       "Student",
       "Self-service access to personal records, requests and payments."
      ],
      [
       "Parent / Guardian",
       "Views progress, attendance, fees and receives notifications."
      ]
     ],
     "reports": [
      "Hour-wise and consolidated attendance reports.",
      "Shortage and defaulter lists.",
      "Attendance percentage and trend analytics.",
      "Examination eligibility reports."
     ],
     "integrations": [
      "Biometric / RFID / face-recognition devices.",
      "SMS / WhatsApp for parent notification.",
      "Examination module for eligibility.",
      "Mobile apps."
     ],
     "compliance": []
    }
   ]
  },
  {
   "num": "03",
   "title": "Teaching & Learning",
   "intro": [
    "Effective teaching and learning depend on digital content, structured lesson planning and fair distribution of faculty effort. This chapter covers the Learning Management System, Lesson Planning & Course Delivery, and Faculty Workload Management — the tools that empower faculty and enrich the student learning experience."
   ],
   "narrative": [],
   "flow": [],
   "callout": [],
   "modules": [
    {
     "num": "3.1",
     "title": "Learning Management System (LMS)",
     "overview": "The Learning Management System delivers digital learning at scale — course content, video lectures, study material, assignments, quizzes and discussion forums — in one integrated environment. It extends the classroom into a continuous, measurable, blended-learning experience.",
     "objectives": [
      "Provide anytime-anywhere access to structured learning content.",
      "Enable online assessment, assignments and instant feedback.",
      "Foster collaboration through discussion and online classes.",
      "Measure engagement and learning outcomes with analytics."
     ],
     "features": [
      "Course Content",
      "Video Lectures",
      "Study Materials",
      "Online Assignments",
      "Quiz",
      "MCQ Assessment",
      "Discussion Forum",
      "Online Classes",
      "Assignment Evaluation",
      "Digital Notes",
      "Learning Analytics"
     ],
     "benefits": [
      "Consistent, high-quality content available to every student.",
      "Continuous assessment and rapid feedback loops.",
      "Higher engagement through interactive, blended learning.",
      "Data-driven insight into learning progress and gaps."
     ],
     "workflow": [
      "Faculty publishes course content and materials.",
      "Students access lectures, notes and resources.",
      "Assignments and quizzes are released and attempted.",
      "Submissions are evaluated and graded.",
      "Discussion forums support collaborative learning.",
      "Learning analytics inform intervention."
     ],
     "roles": [
      [
       "Faculty",
       "Executes day-to-day academic transactions and updates records."
      ],
      [
       "Student",
       "Self-service access to personal records, requests and payments."
      ],
      [
       "Head of Department",
       "Manages department-level allocation, approvals and monitoring."
      ],
      [
       "System Administrator",
       "Configures the module, manages master data, roles and workflow rules."
      ]
     ],
     "reports": [
      "Content usage and access reports.",
      "Assignment and quiz performance analytics.",
      "Student engagement and progress dashboards."
     ],
     "integrations": [
      "Academic Management and Examination (internal marks).",
      "Mobile applications.",
      "Video conferencing for online classes.",
      "OBE for outcome measurement."
     ],
     "compliance": []
    },
    {
     "num": "3.2",
     "title": "Lesson Planning & Course Delivery",
     "overview": "Lesson Planning & Course Delivery equips faculty to plan, document and track the delivery of every course against the curriculum. Lesson plans, teaching diaries and syllabus-coverage tracking ensure academic rigour and provide the documented evidence accreditation bodies expect.",
     "objectives": [
      "Standardise lesson planning aligned to the curriculum.",
      "Track actual delivery against the plan in real time.",
      "Maintain teaching diaries and coverage evidence.",
      "Link delivery to course and program outcomes."
     ],
     "features": [
      "Lesson Plan",
      "Teaching Plan",
      "Course Planning",
      "Syllabus Coverage",
      "Teaching Diary",
      "Completion Tracking",
      "CO Mapping",
      "PO Mapping"
     ],
     "benefits": [
      "Consistent academic delivery across sections and faculty.",
      "Early visibility of syllabus lag for corrective action.",
      "Ready-made documentation for NBA and audits.",
      "Clear linkage between what is taught and outcomes achieved."
     ],
     "workflow": [
      "Faculty prepares lesson and teaching plans.",
      "Plans are reviewed and approved by the HOD.",
      "Delivery is recorded session-by-session in the teaching diary.",
      "Syllabus coverage is tracked against the plan.",
      "Deviations are flagged and addressed.",
      "Coverage and outcome mapping feed accreditation reports."
     ],
     "roles": [
      [
       "Faculty",
       "Executes day-to-day academic transactions and updates records."
      ],
      [
       "Head of Department",
       "Manages department-level allocation, approvals and monitoring."
      ],
      [
       "Principal / Director",
       "Reviews institution-wide status, approvals and analytics dashboards."
      ]
     ],
     "reports": [
      "Lesson plan vs. actual delivery reports.",
      "Syllabus coverage and completion status.",
      "CO/PO mapping documentation."
     ],
     "integrations": [
      "Academic Management and OBE.",
      "LMS and Timetable.",
      "Faculty portal."
     ],
     "compliance": [
      "Delivery and coverage evidence for NBA / NAAC.",
      "CO-PO articulation documentation."
     ]
    },
    {
     "num": "3.3",
     "title": "Faculty Workload Management",
     "overview": "Faculty Workload Management brings transparency and fairness to how teaching effort is distributed. It computes teaching hours, laboratory duties and additional responsibilities, ensuring balanced allocation and providing the workload evidence required for accreditation.",
     "objectives": [
      "Quantify and balance faculty teaching workload.",
      "Track theory, laboratory and extra teaching hours.",
      "Support workload-based allocation decisions.",
      "Generate workload evidence for accreditation."
     ],
     "features": [
      "Faculty Workload",
      "Faculty Allocation",
      "Teaching Hours",
      "Extra Hours",
      "Lab Allocation",
      "Workload Reports"
     ],
     "benefits": [
      "Equitable distribution of teaching effort.",
      "Objective basis for allocation and appraisal.",
      "Transparent visibility of individual and department load.",
      "Audit-ready workload documentation."
     ],
     "workflow": [
      "Define workload norms per cadre and program.",
      "Allocate courses, labs and duties to faculty.",
      "System computes total workload per faculty.",
      "HOD reviews and rebalances allocation.",
      "Workload reports are published for records."
     ],
     "roles": [
      [
       "Head of Department",
       "Manages department-level allocation, approvals and monitoring."
      ],
      [
       "Faculty",
       "Executes day-to-day academic transactions and updates records."
      ],
      [
       "Principal / Director",
       "Reviews institution-wide status, approvals and analytics dashboards."
      ]
     ],
     "reports": [
      "Individual and department workload summaries.",
      "Teaching-hour distribution reports.",
      "Workload compliance reports."
     ],
     "integrations": [
      "Academic Management and Timetable.",
      "HR for appraisal inputs.",
      "Faculty portal."
     ],
     "compliance": [
      "Faculty workload norms evidence for AICTE / NBA."
     ]
    }
   ]
  },
  {
   "num": "04",
   "title": "Examination & Controller of Examinations",
   "intro": [
    "Examinations are the most sensitive and scrutinised function of any institution. This chapter details the modules that manage the complete examination lifecycle — Examination Management, the Controller of Examinations, and Internal Assessment & Outcome-Based Education — with the accuracy, security and analytics that credible results demand."
   ],
   "narrative": [],
   "flow": [],
   "callout": [],
   "modules": [
    {
     "num": "4.1",
     "title": "Examination Management",
     "overview": "Examination Management orchestrates the planning and conduct of examinations end-to-end — scheduling, hall tickets, seating, invigilation and question-paper handling. It brings structure, security and repeatability to a high-stakes process.",
     "objectives": [
      "Plan and schedule examinations across the calendar.",
      "Automate hall tickets, seating and invigilation.",
      "Secure question-bank and paper generation.",
      "Support both online and offline examination modes."
     ],
     "features": [
      "Examination Planning",
      "Exam Calendar",
      "Exam Schedule",
      "Hall Ticket Generation",
      "Seating Arrangement",
      "Invigilator Allocation",
      "Question Bank",
      "Question Paper Generator",
      "Online Examination",
      "Offline Examination"
     ],
     "benefits": [
      "Error-free scheduling and seating at scale.",
      "Secure, randomised question-paper generation.",
      "Reduced manual coordination and paperwork.",
      "Flexible support for online and offline exams."
     ],
     "workflow": [
      "Define the examination calendar and schedule.",
      "Verify eligibility and generate hall tickets.",
      "Prepare seating and invigilation plans.",
      "Compose question papers from the question bank.",
      "Conduct the examination (online / offline).",
      "Hand over scripts for evaluation."
     ],
     "roles": [
      [
       "Controller of Examinations",
       "Owns the exam process end to end."
      ],
      [
       "System Administrator",
       "Configures the module, manages master data, roles and workflow rules."
      ],
      [
       "Faculty",
       "Executes day-to-day academic transactions and updates records."
      ],
      [
       "Student",
       "Self-service access to personal records, requests and payments."
      ]
     ],
     "reports": [
      "Examination schedules and hall-ticket registers.",
      "Seating and invigilation plans.",
      "Attendance and malpractice reports."
     ],
     "integrations": [
      "Attendance (eligibility) and Academic modules.",
      "Finance for exam-fee validation.",
      "Mobile apps for hall tickets."
     ],
     "compliance": [
      "University / autonomous examination norms.",
      "Secure audit trail for examination integrity."
     ]
    },
    {
     "num": "4.2",
     "title": "Controller of Examinations (COE)",
     "overview": "The Controller of Examinations module manages post-examination processing — digital valuation, result computation, grading, transcripts and revaluation — under CBCS and OBE frameworks. It delivers accurate, timely and defensible results with full analytics.",
     "objectives": [
      "Process marks and compute results accurately.",
      "Support CBCS grading, GPA and CGPA computation.",
      "Issue transcripts, mark statements and certificates.",
      "Manage revaluation, supplementary exams and degree audit."
     ],
     "features": [
      "Digital Valuation",
      "Result Processing",
      "Grade Card",
      "GPA",
      "CGPA",
      "CBCS",
      "OBE",
      "Transcript Generation",
      "Consolidated Mark Statement",
      "Rank List",
      "Revaluation",
      "Supplementary Examination",
      "Degree Audit",
      "Result Analytics",
      "Duplicate Certificate"
     ],
     "benefits": [
      "Accurate, tamper-resistant result processing.",
      "Rapid publication of grade cards and transcripts.",
      "Transparent revaluation and grievance handling.",
      "Rich result analytics for academic improvement."
     ],
     "workflow": [
      "Capture internal and external marks.",
      "Perform moderation and grace-mark rules.",
      "Compute grades, GPA and CGPA.",
      "Process results and generate grade cards.",
      "Publish results and handle revaluation requests.",
      "Issue transcripts, consolidated statements and rank lists."
     ],
     "roles": [
      [
       "Controller of Examinations",
       "Governs result processing and publication."
      ],
      [
       "Evaluator",
       "Performs digital / manual valuation."
      ],
      [
       "Registrar",
       "Owns records, approvals, certificates and statutory outputs."
      ],
      [
       "Student",
       "Self-service access to personal records, requests and payments."
      ]
     ],
     "reports": [
      "Result analysis and pass-percentage reports.",
      "Grade distribution and rank lists.",
      "Revaluation and supplementary registers.",
      "Consolidated mark statements and transcripts."
     ],
     "integrations": [
      "OBE for outcome attainment.",
      "Student Information System and Finance.",
      "Mobile apps and student portal."
     ],
     "compliance": [
      "CBCS and OBE-aligned grading and reporting.",
      "Degree audit for graduation requirements."
     ]
    },
    {
     "num": "4.3",
     "title": "Internal Assessment & Outcome-Based Education (OBE)",
     "overview": "This module unifies continuous internal assessment with Outcome-Based Education. It captures CIA, assignment, laboratory and rubric-based marks and computes CO/PO/PSO attainment — turning routine assessment data into the outcome evidence that NBA accreditation requires.",
     "objectives": [
      "Administer continuous internal assessment consistently.",
      "Define PEO, PO, PSO and CO and map them to assessments.",
      "Compute CO and PO attainment automatically.",
      "Generate NBA-ready outcome attainment reports."
     ],
     "features": [
      "Program Educational Objectives (PEO)",
      "Program Outcomes (PO)",
      "Program Specific Outcomes (PSO)",
      "Course Outcomes (CO)",
      "Learning Outcomes (LO)",
      "CO-PO Mapping",
      "CO Attainment",
      "PO Attainment",
      "Bloom's Taxonomy",
      "Graduate Attributes",
      "NBA Compliance Reports",
      "Internal Assessment",
      "CIA Marks",
      "Assignment Marks",
      "Lab Marks",
      "Attendance Marks",
      "Rubrics"
     ],
     "benefits": [
      "Objective, rubric-driven internal assessment.",
      "Automated, defensible outcome attainment computation.",
      "Direct evidence for NBA accreditation.",
      "Continuous-improvement insight from attainment gaps."
     ],
     "workflow": [
      "Define PEOs, POs, PSOs and COs.",
      "Map course outcomes to assessments and questions.",
      "Capture CIA, assignment and lab marks with rubrics.",
      "Compute CO attainment per course.",
      "Roll up to PO / PSO attainment.",
      "Publish attainment reports and improvement actions."
     ],
     "roles": [
      [
       "Faculty",
       "Executes day-to-day academic transactions and updates records."
      ],
      [
       "Head of Department",
       "Manages department-level allocation, approvals and monitoring."
      ],
      [
       "IQAC Coordinator",
       "Reviews attainment and drives improvement."
      ],
      [
       "Principal / Director",
       "Reviews institution-wide status, approvals and analytics dashboards."
      ]
     ],
     "reports": [
      "CO / PO / PSO attainment reports.",
      "Internal assessment mark sheets.",
      "Bloom's-taxonomy and gap analysis.",
      "NBA compliance reports."
     ],
     "integrations": [
      "Examination and Academic modules.",
      "LMS assessment data.",
      "Accreditation module."
     ],
     "compliance": [
      "Full OBE framework for NBA.",
      "Graduate-attribute and attainment evidence."
     ]
    }
   ]
  },
  {
   "num": "05",
   "title": "Finance Management",
   "intro": [
    "Financial control and transparency underpin institutional trust. This chapter covers Fee Management and Accounts & Financial Management — automating collections, scholarships, accounting and statutory compliance while giving management a real-time view of institutional finances."
   ],
   "narrative": [],
   "flow": [],
   "callout": [],
   "modules": [
    {
     "num": "5.1",
     "title": "Fee Management",
     "overview": "Fee Management automates the definition, collection and reconciliation of every category of institutional fee. It supports online payment, scholarships, concessions, instalments and automated dues management — improving cash flow while giving parents a transparent, convenient payment experience.",
     "objectives": [
      "Configure flexible, category-wise fee structures.",
      "Enable secure online and offline fee collection.",
      "Automate scholarships, concessions and instalments.",
      "Track dues and automate reminders and fines."
     ],
     "features": [
      "Fee Structure",
      "Fee Collection",
      "Online Payments",
      "Scholarship Management",
      "Concessions",
      "Installments",
      "Fine Calculation",
      "Refund Management",
      "Receipts",
      "Due Management"
     ],
     "benefits": [
      "Improved and predictable cash flow.",
      "Convenient 24x7 online payment for parents.",
      "Accurate scholarship and concession handling.",
      "Automated dues follow-up reduces outstanding balances."
     ],
     "workflow": [
      "Define fee heads, structures and schedules.",
      "Assign fees to students with concessions / scholarships.",
      "Collect payments online or at the counter.",
      "Issue receipts automatically.",
      "Track dues and apply reminders / fines.",
      "Reconcile collections with accounts."
     ],
     "roles": [
      [
       "Accounts Officer",
       "Handles collections, postings, reconciliation and reports."
      ],
      [
       "Registrar",
       "Owns records, approvals, certificates and statutory outputs."
      ],
      [
       "Student",
       "Self-service access to personal records, requests and payments."
      ],
      [
       "Parent / Guardian",
       "Views progress, attendance, fees and receives notifications."
      ]
     ],
     "reports": [
      "Daily collection and reconciliation reports.",
      "Outstanding-dues and defaulter reports.",
      "Scholarship and concession registers.",
      "Fee-head and category-wise summaries."
     ],
     "integrations": [
      "Payment gateway and banking.",
      "Accounts module for postings.",
      "SMS / WhatsApp / Email reminders.",
      "Student Information System."
     ],
     "compliance": [
      "GST-compliant fee receipts where applicable.",
      "Auditable collection trail."
     ]
    },
    {
     "num": "5.2",
     "title": "Accounts & Financial Management",
     "overview": "Accounts & Financial Management provides institutional-grade bookkeeping — vouchers, ledgers, cash and bank books, budgeting and financial statements — with built-in GST handling. It closes the loop from fee collection to statutory financial reporting.",
     "objectives": [
      "Maintain complete double-entry institutional accounts.",
      "Manage budgets and monitor variance.",
      "Reconcile bank transactions accurately.",
      "Produce statutory and management financial statements."
     ],
     "features": [
      "Voucher",
      "Ledger",
      "Income & Expense",
      "Cash Book",
      "Bank Book",
      "Budget Management",
      "Bank Reconciliation",
      "Financial Statements",
      "GST"
     ],
     "benefits": [
      "A single, reconciled financial picture of the institution.",
      "Disciplined budgeting and spend control.",
      "Faster, accurate period-end closing.",
      "Simplified GST and statutory reporting."
     ],
     "workflow": [
      "Configure chart of accounts and budgets.",
      "Record vouchers for income and expenses.",
      "Post fee collections from Fee Management.",
      "Reconcile bank and cash books.",
      "Monitor budget variance.",
      "Generate financial statements and GST reports."
     ],
     "roles": [
      [
       "Accounts Officer",
       "Handles collections, postings, reconciliation and reports."
      ],
      [
       "Finance Manager",
       "Owns budgeting, reporting and controls."
      ],
      [
       "Principal / Director",
       "Reviews institution-wide status, approvals and analytics dashboards."
      ]
     ],
     "reports": [
      "Trial balance, P&L and balance sheet.",
      "Budget vs. actual variance reports.",
      "Cash / bank book and reconciliation reports.",
      "GST and statutory reports."
     ],
     "integrations": [
      "Fee Management and Payroll.",
      "Banking systems.",
      "GST / statutory filing tools."
     ],
     "compliance": [
      "GST computation and reporting.",
      "Audit-ready statutory financial statements."
     ]
    }
   ]
  },
  {
   "num": "06",
   "title": "Human Resource Management",
   "intro": [
    "People are the institution's greatest asset. This chapter details Human Resource Management and Payroll — digitising the complete employee lifecycle from recruitment to retirement, and automating salary processing with full statutory compliance."
   ],
   "narrative": [],
   "flow": [],
   "callout": [],
   "modules": [
    {
     "num": "6.1",
     "title": "Human Resource Management (HRM)",
     "overview": "HRM manages the complete employee lifecycle — recruitment, records, leave, attendance, performance and appraisal — through a unified system with employee self-service. It reduces administrative overhead while improving transparency and staff engagement.",
     "objectives": [
      "Maintain a complete digital employee master.",
      "Streamline recruitment and onboarding.",
      "Automate leave, attendance and approvals.",
      "Run structured performance and appraisal cycles."
     ],
     "features": [
      "Employee Management",
      "Recruitment",
      "Staff Profile",
      "Leave Management",
      "Attendance",
      "Appraisal",
      "Performance Review",
      "Employee Self-Service",
      "HR Analytics",
      "Employee Self Service"
     ],
     "benefits": [
      "Single source of truth for all HR data.",
      "Faster, transparent leave and approval workflows.",
      "Objective, records-based appraisals.",
      "Reduced HR workload through self-service."
     ],
     "workflow": [
      "Create and maintain employee master records.",
      "Manage recruitment and onboarding.",
      "Capture staff attendance and leave requests.",
      "Route approvals through defined workflows.",
      "Conduct performance reviews and appraisals.",
      "Publish HR analytics to management."
     ],
     "roles": [
      [
       "HR Manager",
       "Manages employee data, leave, payroll and statutory filings."
      ],
      [
       "Principal / Director",
       "Reviews institution-wide status, approvals and analytics dashboards."
      ],
      [
       "Employee",
       "Self-service for leave, records and payslips."
      ],
      [
       "Head of Department",
       "Manages department-level allocation, approvals and monitoring."
      ]
     ],
     "reports": [
      "Employee directory and demographic reports.",
      "Leave and attendance summaries.",
      "Appraisal and performance reports.",
      "HR analytics dashboards."
     ],
     "integrations": [
      "Payroll and Finance.",
      "Biometric attendance devices.",
      "Faculty workload for appraisal inputs."
     ],
     "compliance": [
      "Statutory personnel record-keeping.",
      "Faculty qualification data for AICTE / NAAC."
     ]
    },
    {
     "num": "6.2",
     "title": "Payroll Management",
     "overview": "Payroll Management automates salary processing with complete statutory compliance — PF, ESI, professional tax and income tax — generating payslips and bank advice with accuracy and on time, every cycle.",
     "objectives": [
      "Automate accurate, on-time salary processing.",
      "Handle all statutory deductions and filings.",
      "Generate payslips, bank advice and payroll registers.",
      "Integrate seamlessly with accounts."
     ],
     "features": [
      "Payroll",
      "Salary Processing",
      "Increment Management",
      "PF",
      "ESI",
      "Professional Tax",
      "Income Tax",
      "Payslip",
      "Bank Advice",
      "Payroll Reports"
     ],
     "benefits": [
      "Error-free, timely salary disbursement.",
      "Automatic statutory compliance and reporting.",
      "Transparent payslips via self-service.",
      "Reduced manual payroll effort and risk."
     ],
     "workflow": [
      "Configure salary structures and components.",
      "Capture attendance, leave and increments.",
      "Compute gross, deductions and net pay.",
      "Generate payslips and bank advice.",
      "File statutory deductions (PF / ESI / PT / IT).",
      "Post payroll to accounts."
     ],
     "roles": [
      [
       "HR Manager",
       "Manages employee data, leave, payroll and statutory filings."
      ],
      [
       "Accounts Officer",
       "Handles collections, postings, reconciliation and reports."
      ],
      [
       "Employee",
       "Views and downloads payslips."
      ]
     ],
     "reports": [
      "Payroll registers and salary sheets.",
      "Statutory deduction (PF/ESI/PT/IT) reports.",
      "Bank advice statements.",
      "Cost-to-institution analysis."
     ],
     "integrations": [
      "HRM and Finance / Accounts.",
      "Banking for salary disbursement.",
      "Statutory filing portals."
     ],
     "compliance": [
      "PF, ESI, Professional Tax and Income Tax compliance.",
      "Form-16 and statutory payroll reporting."
     ]
    }
   ]
  },
  {
   "num": "07",
   "title": "Campus Administration",
   "intro": [
    "Beyond academics, a campus runs on well-managed support services. This chapter covers Library, Hostel & Mess, Transport and Inventory & Asset Management — the operational modules that keep daily campus life running smoothly and safely."
   ],
   "narrative": [],
   "flow": [],
   "callout": [],
   "modules": [
    {
     "num": "7.1",
     "title": "Library Management",
     "overview": "Library Management digitises the entire library — cataloguing, circulation, fines and digital resources — with barcode and RFID support and a public OPAC. It maximises the use and reach of the institution's knowledge resources.",
     "objectives": [
      "Digitise cataloguing and circulation.",
      "Provide OPAC search for staff and students.",
      "Automate issue, return and fine handling.",
      "Extend access through a digital library and e-books."
     ],
     "features": [
      "OPAC",
      "Barcode Support",
      "Book Issue & Return",
      "Digital Library",
      "E-Books",
      "Journal Management",
      "Subscription Management",
      "Fine Calculation",
      "Library Reports",
      "Barcode",
      "RFID",
      "Digital Library"
     ],
     "benefits": [
      "Faster circulation with barcode / RFID.",
      "Anytime discovery through OPAC and digital library.",
      "Accurate fine and inventory management.",
      "Higher utilisation of learning resources."
     ],
     "workflow": [
      "Catalogue titles and tag with barcode / RFID.",
      "Members search the catalogue via OPAC.",
      "Issue and return are recorded at the counter.",
      "Overdue fines are computed automatically.",
      "Digital resources are accessed online.",
      "Usage and stock reports are generated."
     ],
     "roles": [
      [
       "Librarian",
       "Manages catalogue, circulation and members."
      ],
      [
       "Faculty",
       "Executes day-to-day academic transactions and updates records."
      ],
      [
       "Student",
       "Self-service access to personal records, requests and payments."
      ]
     ],
     "reports": [
      "Circulation and overdue reports.",
      "Title / member usage analytics.",
      "Stock verification and fine reports."
     ],
     "integrations": [
      "Student Information System.",
      "Barcode / RFID hardware.",
      "Finance for fines.",
      "Mobile apps."
     ],
     "compliance": []
    },
    {
     "num": "7.2",
     "title": "Hostel & Mess Management",
     "overview": "Hostel & Mess Management handles residential operations end-to-end — admissions, room and bed allocation, visitor and gate-pass control, mess menus, attendance and billing — improving resident safety, comfort and cost control.",
     "objectives": [
      "Automate hostel admission and room allocation.",
      "Ensure resident safety through visitor and gate-pass control.",
      "Manage mess menus, attendance and billing.",
      "Handle complaints and maintenance efficiently."
     ],
     "features": [
      "Hostel Admission",
      "Room Allocation",
      "Bed Management",
      "Visitor Management",
      "Gate Pass",
      "Leave Management",
      "Mess Attendance",
      "Menu Planning",
      "Recipe Management",
      "Inventory",
      "Mess Billing",
      "Hostel Analytics"
     ],
     "benefits": [
      "Optimised occupancy and allocation.",
      "Improved resident safety and accountability.",
      "Transparent mess billing and reduced wastage.",
      "Faster complaint and maintenance resolution."
     ],
     "workflow": [
      "Process hostel admission and allocate rooms / beds.",
      "Record visitor entries and gate passes.",
      "Capture mess attendance and plan menus.",
      "Generate mess and hostel bills.",
      "Log and resolve complaints and maintenance.",
      "Publish occupancy and billing reports."
     ],
     "roles": [
      [
       "Hostel Warden",
       "Manages residents, allocation and discipline."
      ],
      [
       "Mess Supervisor",
       "Manages menus, attendance and inventory."
      ],
      [
       "Student",
       "Self-service access to personal records, requests and payments."
      ],
      [
       "Parent / Guardian",
       "Views progress, attendance, fees and receives notifications."
      ]
     ],
     "reports": [
      "Occupancy and allocation reports.",
      "Visitor and gate-pass logs.",
      "Mess attendance and billing reports.",
      "Complaint / maintenance status."
     ],
     "integrations": [
      "Student Information System and Finance.",
      "Biometric / RFID for hostel attendance.",
      "Mobile apps for residents and parents."
     ],
     "compliance": []
    },
    {
     "num": "7.3",
     "title": "Transport Management",
     "overview": "Transport Management optimises the institution's fleet and routes with GPS tracking, boarding-point management, driver records and integrated fee collection — improving student safety and operational efficiency.",
     "objectives": [
      "Plan and optimise routes and boarding points.",
      "Track vehicles live with GPS.",
      "Maintain vehicle, driver and fuel records.",
      "Integrate transport fee collection."
     ],
     "features": [
      "Vehicle Management",
      "Route Planning",
      "Boarding Points",
      "Driver Management",
      "Fuel Tracking",
      "Vehicle Maintenance",
      "Student Transport Allocation",
      "Transport Fee Collection",
      "GPS",
      "Live Tracking"
     ],
     "benefits": [
      "Improved student safety through live tracking.",
      "Optimised routes reduce cost and travel time.",
      "Proactive maintenance and fuel control.",
      "Transparent transport-fee management."
     ],
     "workflow": [
      "Define vehicles, routes and boarding points.",
      "Allocate students to routes and stops.",
      "Track trips live via GPS.",
      "Record fuel, maintenance and driver data.",
      "Collect transport fees.",
      "Generate utilisation and safety reports."
     ],
     "roles": [
      [
       "Transport Officer",
       "Manages fleet, routes and drivers."
      ],
      [
       "Student",
       "Self-service access to personal records, requests and payments."
      ],
      [
       "Parent / Guardian",
       "Views progress, attendance, fees and receives notifications."
      ]
     ],
     "reports": [
      "Route and vehicle utilisation reports.",
      "GPS trip and arrival reports.",
      "Fuel and maintenance reports.",
      "Transport fee collection."
     ],
     "integrations": [
      "GPS devices and mapping.",
      "Finance for transport fees.",
      "SMS / mobile apps for parents."
     ],
     "compliance": []
    },
    {
     "num": "7.4",
     "title": "Inventory & Asset Management",
     "overview": "Inventory & Asset Management controls procurement, stock and fixed assets across the institution — from purchase requisition to asset maintenance and AMC tracking — ensuring accountability and optimal utilisation of institutional resources.",
     "objectives": [
      "Streamline procurement from request to receipt.",
      "Track stock levels and consumption.",
      "Maintain a complete fixed-asset register.",
      "Manage maintenance and AMC schedules."
     ],
     "features": [
      "Purchase Request",
      "Purchase Order",
      "Vendor Management",
      "Asset Register",
      "Stock Management",
      "AMC Tracking",
      "Asset Maintenance",
      "Store Management",
      "Purchase",
      "Issue",
      "Return"
     ],
     "benefits": [
      "Controlled, transparent procurement.",
      "Accurate stock and reduced pilferage.",
      "Complete visibility of institutional assets.",
      "Timely maintenance extends asset life."
     ],
     "workflow": [
      "Raise and approve purchase requisitions.",
      "Issue purchase orders to vendors.",
      "Receive goods and update stock.",
      "Issue / return items to departments.",
      "Register and tag fixed assets.",
      "Schedule maintenance and track AMC."
     ],
     "roles": [
      [
       "Store / Purchase Officer",
       "Manages procurement and stock."
      ],
      [
       "Asset Manager",
       "Maintains the asset register and AMC."
      ],
      [
       "Accounts Officer",
       "Handles collections, postings, reconciliation and reports."
      ]
     ],
     "reports": [
      "Purchase and vendor reports.",
      "Stock ledger and reorder reports.",
      "Asset register and depreciation.",
      "AMC and maintenance schedules."
     ],
     "integrations": [
      "Finance / Accounts.",
      "Vendor management.",
      "Departmental requisition workflows."
     ],
     "compliance": []
    }
   ]
  },
  {
   "num": "08",
   "title": "Student Development",
   "intro": [
    "Institutions are measured by the success of their students and the strength of their scholarship. This chapter covers Placement & Career Services, Alumni Management and Research & Innovation — the modules that advance careers, sustain lifelong relationships and elevate the institution's academic standing."
   ],
   "narrative": [],
   "flow": [],
   "callout": [],
   "modules": [
    {
     "num": "8.1",
     "title": "Placement & Career Services",
     "overview": "Placement & Career Services manages the complete campus-recruitment lifecycle — from company engagement and eligibility screening to interview scheduling, offers and analytics — while preparing students through training and career guidance.",
     "objectives": [
      "Engage recruiters and manage campus drives.",
      "Screen and shortlist eligible students automatically.",
      "Coordinate interviews and track offers.",
      "Prepare students through training and guidance."
     ],
     "features": [
      "Company Registration",
      "Campus Drives",
      "Student Eligibility",
      "Resume Management",
      "Interview Scheduling",
      "Placement Tracking",
      "Offer Management",
      "Alumni Referrals",
      "Placement Analytics",
      "Internship",
      "Career Guidance",
      "Training",
      "Company Drive"
     ],
     "benefits": [
      "Higher placement rates through structured drives.",
      "Effortless eligibility filtering and shortlisting.",
      "Better-prepared, job-ready graduates.",
      "Rich placement analytics for accreditation and ranking."
     ],
     "workflow": [
      "Register companies and schedule drives.",
      "Filter eligible students by criteria.",
      "Manage resumes and applications.",
      "Schedule interviews and assessments.",
      "Record offers and acceptances.",
      "Publish placement analytics."
     ],
     "roles": [
      [
       "Placement Officer",
       "Owns recruiter relations and drives."
      ],
      [
       "Student",
       "Self-service access to personal records, requests and payments."
      ],
      [
       "Head of Department",
       "Manages department-level allocation, approvals and monitoring."
      ]
     ],
     "reports": [
      "Placement statistics and package analysis.",
      "Company-wise and department-wise reports.",
      "Offer and acceptance tracking.",
      "Training and readiness reports."
     ],
     "integrations": [
      "Student Information System.",
      "Alumni for referrals.",
      "Communication and mobile apps."
     ],
     "compliance": [
      "Placement data for NIRF and NAAC."
     ]
    },
    {
     "num": "8.2",
     "title": "Alumni Management",
     "overview": "Alumni Management sustains lifelong engagement with graduates through a dedicated portal, directory, events, mentorship and giving — turning alumni into an enduring asset for placements, funding and institutional reputation.",
     "objectives": [
      "Build and maintain an accurate alumni directory.",
      "Engage alumni through events and networking.",
      "Enable mentorship and referrals for students.",
      "Facilitate alumni contributions and giving."
     ],
     "features": [
      "Alumni Registration",
      "Alumni Portal",
      "Alumni Directory",
      "Events",
      "Donations",
      "Networking",
      "Mentorship"
     ],
     "benefits": [
      "A strong, connected alumni community.",
      "Alumni-driven placement and mentoring opportunities.",
      "Additional funding through structured giving.",
      "Enhanced institutional reputation and outreach."
     ],
     "workflow": [
      "Onboard graduates into the alumni portal.",
      "Maintain the alumni directory.",
      "Organise events and networking.",
      "Facilitate mentorship and referrals.",
      "Manage donations and contributions.",
      "Report on engagement."
     ],
     "roles": [
      [
       "Alumni Relations Officer",
       "Drives alumni engagement and events."
      ],
      [
       "Alumnus",
       "Networks, mentors and contributes."
      ],
      [
       "Student",
       "Self-service access to personal records, requests and payments."
      ]
     ],
     "reports": [
      "Alumni directory and engagement reports.",
      "Event participation reports.",
      "Donation and contribution reports."
     ],
     "integrations": [
      "Placement for referrals.",
      "Communication and events.",
      "Mobile apps and payment gateway."
     ],
     "compliance": []
    },
    {
     "num": "8.3",
     "title": "Research & Innovation",
     "overview": "Research & Innovation captures and showcases the institution's scholarly output — publications, patents, funded projects, consultancy and events — providing the consolidated evidence needed for accreditation, ranking and continuous academic advancement.",
     "objectives": [
      "Maintain a central repository of research output.",
      "Track funded projects, grants and consultancy.",
      "Record faculty and student research activity.",
      "Generate research metrics for ranking and accreditation."
     ],
     "features": [
      "Publications",
      "Patents",
      "Consultancy",
      "Funded Projects",
      "Journals",
      "Conferences",
      "FDP",
      "Workshops",
      "Faculty Research",
      "Student Research",
      "Grants"
     ],
     "benefits": [
      "Complete visibility of institutional research.",
      "Ready evidence for NIRF, NBA and NAAC.",
      "Recognition that attracts talent and funding.",
      "Data-driven research strategy."
     ],
     "workflow": [
      "Faculty and students record research output.",
      "Publications, patents and projects are catalogued.",
      "Grants and consultancy are tracked.",
      "Events, FDPs and workshops are logged.",
      "Research analytics are compiled.",
      "Evidence is exported for accreditation."
     ],
     "roles": [
      [
       "Research Coordinator / Dean (R&D)",
       "Governs research records and strategy."
      ],
      [
       "Faculty",
       "Executes day-to-day academic transactions and updates records."
      ],
      [
       "Student",
       "Self-service access to personal records, requests and payments."
      ]
     ],
     "reports": [
      "Publication and patent reports.",
      "Funded-project and grant reports.",
      "Consultancy and event reports.",
      "Research analytics dashboards."
     ],
     "integrations": [
      "Accreditation module.",
      "HR (faculty profiles).",
      "Communication for events."
     ],
     "compliance": [
      "Research metrics for NIRF and NBA / NAAC."
     ]
    }
   ]
  },
  {
   "num": "09",
   "title": "Accreditation & Compliance",
   "intro": [
    "Accreditation is no longer periodic — it is continuous. This chapter details the Accreditation Management module that keeps the institution audit-ready year-round across NAAC, NBA, NIRF, IQAC, AISHE, AICTE and UGC requirements."
   ],
   "narrative": [],
   "flow": [],
   "callout": [],
   "modules": [
    {
     "num": "9.1",
     "title": "Accreditation Management (NAAC · NBA · NIRF · IQAC)",
     "overview": "Accreditation Management transforms compliance from a periodic scramble into a continuous, data-driven discipline. It collects criteria-wise data, manages evidence, maps it to accreditation frameworks and produces the reports that NAAC, NBA, NIRF, IQAC, AISHE, AICTE and UGC demand — on demand.",
     "objectives": [
      "Automate criteria-wise data collection year-round.",
      "Maintain a central, mapped evidence repository.",
      "Generate SSR, AQAR, NIRF and AISHE outputs.",
      "Provide a live compliance dashboard to leadership."
     ],
     "features": [
      "SSR Data Collection",
      "Criteria-wise Reports",
      "AQAR Reports",
      "DVV Support",
      "AISHE Reports",
      "NIRF Data",
      "IQAC Documentation",
      "Academic Audit",
      "Department Audit",
      "Compliance Dashboard",
      "AISHE",
      "AICTE",
      "UGC",
      "Document Repository",
      "Evidence Management",
      "Criteria Mapping",
      "Compliance Dashboard"
     ],
     "benefits": [
      "Continuous audit-readiness, not last-minute effort.",
      "Single, verifiable evidence repository.",
      "Reports generated on demand across frameworks.",
      "Higher accreditation grades and rankings."
     ],
     "workflow": [
      "Configure applicable frameworks and criteria.",
      "Collect criteria-wise data automatically from modules.",
      "Attach and map supporting evidence.",
      "Validate data (DVV) and resolve gaps.",
      "Generate SSR / AQAR / NIRF / AISHE reports.",
      "Monitor compliance via the dashboard."
     ],
     "roles": [
      [
       "IQAC Coordinator",
       "Owns quality data, evidence and reporting."
      ],
      [
       "Principal / Director",
       "Reviews institution-wide status, approvals and analytics dashboards."
      ],
      [
       "Head of Department",
       "Manages department-level allocation, approvals and monitoring."
      ],
      [
       "Registrar",
       "Owns records, approvals, certificates and statutory outputs."
      ]
     ],
     "reports": [
      "Criteria-wise SSR and AQAR reports.",
      "NIRF and AISHE data submissions.",
      "DVV and evidence reports.",
      "Compliance dashboards and gap analysis."
     ],
     "integrations": [
      "Every academic and administrative module (data sources).",
      "Document repository.",
      "OBE / Examination for outcome data."
     ],
     "compliance": [
      "NAAC, NBA, NIRF, IQAC, AISHE, AICTE and UGC frameworks.",
      "End-to-end evidence traceability."
     ]
    }
   ]
  },
  {
   "num": "10",
   "title": "Knowledge Base",
   "intro": [
    "A capable platform is only as valuable as the ease with which people use it. The Knowledge Base gives every user self-service access to guidance, documentation and support, accelerating adoption and reducing dependence on the helpdesk."
   ],
   "narrative": [],
   "flow": [],
   "callout": [],
   "modules": [
    {
     "num": "10.1",
     "title": "Knowledge Base & Help Center",
     "overview": "The Knowledge Base is the institution's self-service support and documentation hub. It houses how-to articles, user manuals, FAQs and video tutorials, and provides a structured support-ticketing channel — driving faster onboarding and consistent, confident usage across all roles.",
     "objectives": [
      "Provide role-based self-service help and documentation.",
      "Reduce support dependency through searchable guidance.",
      "Standardise onboarding for new users.",
      "Channel and track support requests to resolution."
     ],
     "features": [
      "Knowledge Articles",
      "User Manuals",
      "FAQs",
      "Video Tutorials",
      "Role-Based Help",
      "Search",
      "Support Ticketing",
      "SLA Tracking",
      "Feedback on Articles"
     ],
     "benefits": [
      "Faster adoption and shorter learning curve.",
      "Fewer repetitive support requests.",
      "Consistent guidance across all users.",
      "Continuous improvement from usage feedback."
     ],
     "workflow": [
      "Publish articles, manuals and tutorials by role.",
      "Users search and self-serve answers.",
      "Unresolved issues raise a support ticket.",
      "Tickets are routed, tracked and resolved within SLA.",
      "Article feedback drives content improvement."
     ],
     "roles": [
      [
       "System Administrator",
       "Configures the module, manages master data, roles and workflow rules."
      ],
      [
       "Support Agent",
       "Resolves tickets and maintains content."
      ],
      [
       "User",
       "Self-serves help and raises tickets."
      ]
     ],
     "reports": [
      "Article usage and search analytics.",
      "Ticket volume and SLA-compliance reports.",
      "Knowledge-gap analysis."
     ],
     "integrations": [
      "All modules (contextual help).",
      "Communication and mobile apps.",
      "Email for ticket notifications."
     ],
     "compliance": []
    }
   ]
  },
  {
   "num": "11",
   "title": "Communication Platform",
   "intro": [
    "Timely, reliable communication binds the campus community together. The Communication Platform unifies every channel — SMS, email, WhatsApp and push notifications — with circulars, notices, surveys and feedback into one governed hub."
   ],
   "narrative": [],
   "flow": [],
   "callout": [],
   "modules": [
    {
     "num": "11.1",
     "title": "Communication Hub",
     "overview": "The Communication Hub centralises all institutional communication across SMS, email, WhatsApp and push notifications, alongside circulars, notice boards, announcements, surveys and feedback. It ensures the right message reaches the right audience instantly, with a complete record.",
     "objectives": [
      "Unify all communication channels in one platform.",
      "Target messages to precise audience groups.",
      "Digitise circulars, notices and announcements.",
      "Capture stakeholder feedback through surveys."
     ],
     "features": [
      "SMS",
      "Email",
      "WhatsApp",
      "Push Notifications",
      "Circulars",
      "Announcements",
      "Discussion Forum",
      "Event Calendar",
      "Notice Board",
      "Meeting",
      "Survey",
      "Feedback",
      "Calendar"
     ],
     "benefits": [
      "Instant, reliable reach across channels.",
      "Reduced communication cost and effort.",
      "Complete, auditable communication history.",
      "Actionable insight from surveys and feedback."
     ],
     "workflow": [
      "Compose a message and select the channel.",
      "Target the recipient group.",
      "Schedule or send instantly.",
      "Track delivery and read status.",
      "Collect responses and feedback.",
      "Archive for records."
     ],
     "roles": [
      [
       "System Administrator",
       "Configures the module, manages master data, roles and workflow rules."
      ],
      [
       "Principal / Director",
       "Reviews institution-wide status, approvals and analytics dashboards."
      ],
      [
       "Faculty",
       "Executes day-to-day academic transactions and updates records."
      ],
      [
       "Student",
       "Self-service access to personal records, requests and payments."
      ],
      [
       "Parent / Guardian",
       "Views progress, attendance, fees and receives notifications."
      ]
     ],
     "reports": [
      "Message delivery and read reports.",
      "Channel-wise usage and cost.",
      "Survey and feedback analytics."
     ],
     "integrations": [
      "SMS / WhatsApp / Email gateways.",
      "All modules (event-triggered alerts).",
      "Mobile apps (push notifications)."
     ],
     "compliance": []
    }
   ]
  },
  {
   "num": "12",
   "title": "Mobile Applications",
   "intro": [
    "The campus lives in the palm of every stakeholder's hand. Aveon's native mobile applications give students, faculty, parents and management role-specific, always-on access to the platform."
   ],
   "narrative": [],
   "flow": [],
   "callout": [],
   "modules": [
    {
     "num": "12.1",
     "title": "Mobile Applications Suite",
     "overview": "The Mobile Applications suite delivers dedicated, role-based Android and iOS apps for students, faculty, parents and management, plus operational apps for hostel, transport, placement and visitor management. Each app surfaces the right features for its user, with secure login, push notifications and offline-friendly design.",
     "objectives": [
      "Provide role-specific mobile access to the platform.",
      "Deliver real-time notifications to every stakeholder.",
      "Enable on-the-go transactions and self-service.",
      "Extend operational modules to field staff."
     ],
     "features": [
      "Android & iOS",
      "Student App",
      "Faculty App",
      "Parent App",
      "Management App",
      "Push Notifications",
      "Digital ID Card",
      "Online Payments",
      "Attendance",
      "Results",
      "Student App",
      "Faculty App",
      "Parent App",
      "Management App",
      "Hostel App",
      "Transport App",
      "Placement App",
      "Visitor App"
     ],
     "benefits": [
      "Anytime-anywhere access boosts engagement.",
      "Instant push notifications keep everyone informed.",
      "Reduced counter footfall through self-service.",
      "Field operations digitised on mobile."
     ],
     "workflow": [
      "User installs the role-based app.",
      "Secure authentication (with SSO / MFA).",
      "Role-specific dashboard and features load.",
      "User transacts and receives notifications.",
      "Data syncs with the central platform."
     ],
     "roles": [
      [
       "Student",
       "Self-service access to personal records, requests and payments."
      ],
      [
       "Faculty",
       "Executes day-to-day academic transactions and updates records."
      ],
      [
       "Parent / Guardian",
       "Views progress, attendance, fees and receives notifications."
      ],
      [
       "Principal / Director",
       "Reviews institution-wide status, approvals and analytics dashboards."
      ]
     ],
     "reports": [
      "App adoption and usage analytics.",
      "Notification delivery reports.",
      "Feature-wise engagement."
     ],
     "integrations": [
      "All core modules via mobile APIs.",
      "Push-notification services.",
      "Payment gateway and communication."
     ],
     "compliance": []
    }
   ]
  },
  {
   "num": "13",
   "title": "Reports & Analytics",
   "intro": [
    "Data becomes advantage only when it is visible and actionable. This chapter details the reporting and business-intelligence layer that turns operational data from every module into 1000+ ready reports, interactive dashboards and self-service analytics."
   ],
   "narrative": [],
   "flow": [],
   "callout": [],
   "modules": [
    {
     "num": "13.1",
     "title": "Reports & Business Intelligence",
     "overview": "The Reports & Analytics layer provides more than 1,000 dynamic, ready-to-use reports across every module, plus interactive dashboards, a self-service query builder and Power BI integration. It gives every stakeholder — from clerk to chairman — the right view of the right data at the right time.",
     "objectives": [
      "Provide comprehensive, ready-made reporting across modules.",
      "Deliver role-based interactive dashboards.",
      "Enable self-service ad-hoc analysis.",
      "Support scheduled and exportable reporting."
     ],
     "features": [
      "Management Dashboard",
      "Principal Dashboard",
      "HOD Dashboard",
      "COE Dashboard",
      "Finance Dashboard",
      "HR Dashboard",
      "Placement Dashboard",
      "Real-time KPIs",
      "Interactive Charts",
      "Custom Reports",
      "Excel/PDF Export",
      "1000+ Dynamic Reports",
      "Power BI",
      "Custom Query Builder",
      "Scheduled Reports",
      "Excel / PDF Export"
     ],
     "benefits": [
      "Faster, evidence-based decisions at every level.",
      "No dependence on IT for routine reports.",
      "Consistent KPIs across the institution.",
      "Automated delivery of periodic reports."
     ],
     "workflow": [
      "Select or build the required report.",
      "Apply filters and parameters.",
      "Visualise via dashboards and charts.",
      "Schedule recurring reports.",
      "Export to Excel / PDF or Power BI.",
      "Share with stakeholders."
     ],
     "roles": [
      [
       "Principal / Director",
       "Reviews institution-wide status, approvals and analytics dashboards."
      ],
      [
       "Head of Department",
       "Manages department-level allocation, approvals and monitoring."
      ],
      [
       "System Administrator",
       "Configures the module, manages master data, roles and workflow rules."
      ],
      [
       "Management / Trust",
       "Consumes institution-wide analytics."
      ]
     ],
     "reports": [
      "Institutional KPI dashboards.",
      "Module-wise operational reports.",
      "Custom ad-hoc reports.",
      "Scheduled management reports."
     ],
     "integrations": [
      "All modules (data sources).",
      "Power BI and Excel.",
      "Email for scheduled delivery."
     ],
     "compliance": []
    }
   ]
  },
  {
   "num": "14",
   "title": "Security",
   "intro": [
    "Institutional data is sensitive and regulated. This chapter details the security architecture that protects it — role-based access, encryption, multi-factor authentication, audit trails and resilient backup and recovery."
   ],
   "narrative": [],
   "flow": [],
   "callout": [],
   "modules": [
    {
     "num": "14.1",
     "title": "Security & Access Control",
     "overview": "Security & Access Control governs who can see and do what across the platform. It combines granular role-based access, multi-factor authentication and single sign-on with encryption, comprehensive audit trails and disciplined backup, recovery and session management — protecting institutional data end to end.",
     "objectives": [
      "Enforce least-privilege, role-based access.",
      "Strengthen authentication with MFA and SSO.",
      "Protect data with encryption and secure APIs.",
      "Ensure resilience through backup and disaster recovery."
     ],
     "features": [
      "Role-Based Access Control (RBAC)",
      "Multi-Campus Management",
      "Multi-Institution Support",
      "Audit Logs",
      "Data Encryption",
      "Automatic Backup",
      "Disaster Recovery",
      "Two-Factor Authentication",
      "Cloud Deployment",
      "On-Premise Deployment",
      "API Security",
      "MFA",
      "SSO",
      "Password Policy",
      "Session Management",
      "API Security"
     ],
     "benefits": [
      "Reduced risk of unauthorised access and data loss.",
      "Strong authentication without user friction (SSO).",
      "Complete accountability through audit trails.",
      "Business continuity via backup and DR."
     ],
     "workflow": [
      "Define roles and granular permissions.",
      "Provision users with least-privilege access.",
      "Enforce MFA / SSO at login.",
      "Encrypt data at rest and in transit.",
      "Log all activity to the audit trail.",
      "Run automated backups and DR drills."
     ],
     "roles": [
      [
       "Security Administrator",
       "Owns roles, policies and audits."
      ],
      [
       "System Administrator",
       "Configures the module, manages master data, roles and workflow rules."
      ],
      [
       "Auditor",
       "Reviews audit trails and access."
      ]
     ],
     "reports": [
      "Access and permission reports.",
      "Audit-trail and activity logs.",
      "Login / MFA and anomaly reports.",
      "Backup and DR status."
     ],
     "integrations": [
      "Identity providers (SSO).",
      "All modules (access enforcement).",
      "Backup and monitoring infrastructure."
     ],
     "compliance": [
      "Data-protection and privacy safeguards.",
      "Access and audit evidence for institutional audits."
     ]
    }
   ]
  },
  {
   "num": "15",
   "title": "Technology",
   "intro": [
    "A modern platform must be scalable, resilient and open. This chapter describes Aveon's technology architecture — cloud or on-premise deployment, microservices, containerisation and enterprise databases — engineered for performance, availability and integration."
   ],
   "narrative": [],
   "flow": [],
   "callout": [],
   "modules": [
    {
     "num": "15.1",
     "title": "Technology & Architecture",
     "overview": "Aveon CMS ERP is built on a modern, scalable architecture that runs equally well on the cloud (Azure / AWS) or on-premise. A microservices design with containerised deployment, enterprise databases and open REST / mobile APIs delivers high availability, performance and seamless integration with the institution's wider ecosystem.",
     "objectives": [
      "Offer flexible cloud and on-premise deployment.",
      "Scale elastically through microservices and containers.",
      "Guarantee availability with HA and load balancing.",
      "Expose open APIs for integration and extensibility."
     ],
     "features": [
      "Payment Gateway",
      "SMS Gateway",
      "Email Integration",
      "Google Workspace",
      "Microsoft 365",
      "REST APIs",
      "ERP Integration",
      "Single Sign-On (SSO)",
      "Cloud",
      "On-Premise",
      "Microservices",
      "Docker",
      "Azure",
      "AWS",
      "SQL Server",
      "MySQL",
      "PostgreSQL",
      "High Availability",
      "Load Balancer",
      "Performance Optimization"
     ],
     "benefits": [
      "Deployment freedom to match institutional policy.",
      "Elastic scale to handle peak loads (results, admissions).",
      "High availability and resilience.",
      "Future-proof, integration-ready platform."
     ],
     "workflow": [
      "Select deployment model (cloud / on-premise).",
      "Provision infrastructure and databases.",
      "Deploy containerised microservices.",
      "Configure HA, load balancing and backups.",
      "Integrate via REST / mobile APIs.",
      "Monitor and optimise performance."
     ],
     "roles": [
      [
       "IT Administrator",
       "Manages infrastructure and deployment."
      ],
      [
       "Integration Engineer",
       "Builds and maintains API integrations."
      ],
      [
       "System Administrator",
       "Configures the module, manages master data, roles and workflow rules."
      ]
     ],
     "reports": [
      "System health and uptime dashboards.",
      "Performance and load reports.",
      "API usage and integration logs.",
      "Backup and DR reports."
     ],
     "integrations": [
      "ERP, payment, SMS and email gateways.",
      "Google Workspace / Microsoft 365.",
      "Single Sign-On providers.",
      "Third-party systems via REST APIs."
     ],
     "compliance": []
    }
   ]
  },
  {
   "num": "16",
   "title": "Digital Campus Ecosystem",
   "intro": [
    "The true power of Aveon CMS ERP is not any single module — it is the seamless flow of information across all of them. From the first lead to lifelong alumni engagement, every stage feeds the next, and every transaction rolls up into AI-driven analytics and the management dashboard. This is the signature architecture that makes the institution run as one."
   ],
   "narrative": [],
   "flow": [
    "Lead Management",
    "Admission CRM",
    "Online Admission",
    "Student Information System",
    "Academic Management",
    "Attendance",
    "Timetable",
    "Learning Management",
    "Assessment",
    "Examination",
    "Controller of Examinations",
    "Finance",
    "HRMS",
    "Library",
    "Hostel",
    "Transport",
    "Placement",
    "Alumni",
    "Research",
    "NAAC",
    "IQAC",
    "NBA",
    "NIRF",
    "AI Analytics",
    "Management Dashboard"
   ],
   "callout": [
    "One connected platform from admission to alumni.",
    "Every transaction feeds real-time analytics and the management dashboard.",
    "Accreditation evidence (NAAC, NBA, NIRF, IQAC) generated continuously from live data."
   ],
   "modules": []
  }
 ],
 "about": {
  "paragraphs": [
   "Aveon Infotech Private Limited is a technology partner with a decade of experience delivering tailored ERP solutions for educational institutions across India. We blend deep academic domain expertise with modern software engineering to build a platform that institutions use every day — from the front office to the boardroom.",
   "The Aveon Complete Campus Management System is our flagship product: a single, enterprise-grade platform that digitises the entire institution and keeps it audit-ready, data-driven and future-proof."
  ],
  "signature": [
   "For Aveon Infotech Private Limited",
   "Parvathi G",
   "Chief Executive Officer",
   "Contact:  [Phone]   |   [Email]   |   [Website]"
  ]
 }
};
