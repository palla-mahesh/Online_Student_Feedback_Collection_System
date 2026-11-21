import type { LanguageCode } from './types.ts';

export const LANGUAGE_LABELS: Record<LanguageCode, string> = {
  en: 'English',
  hi: 'हिन्दी (Hindi)',
  kn: 'ಕನ್ನಡ (Kannada)',
  te: 'తెలుగు (Telugu)',
};

export interface TranslationBundle {
  appBrand: string;
  navDashboard: string;
  navSubmitFeedback: string;
  navHistory: string;
  navAnalytics: string;
  navAiInsights: string;
  navCourses: string;
  navTeachers: string;
  navStudents: string;
  navReports: string;
  navSettings: string;
  navHelp: string;
  signOut: string;
  submitFeedbackTitle: string;
  submitFeedbackSubtitle: string;
  selectCampaign: string;
  selectDepartment: string;
  selectYear: string;
  selectSemester: string;
  selectCourse: string;
  selectSubject: string;
  assignedInstructor: string;
  anonymousLabel: string;
  anonymousHint: string;
  writtenCommentsLabel: string;
  writtenCommentsPlaceholder: string;
  saveDraft: string;
  submitEvaluation: string;
  updateEvaluation: string;
  completionProgress: string;
  dimensions: {
    teaching_quality: string;
    communication: string;
    punctuality: string;
    subject_knowledge: string;
    methodology: string;
    classroom_environment: string;
    infrastructure: string;
    overall_satisfaction: string;
  };
  helpTitle: string;
  askAssistantPlaceholder: string;
  sendMessage: string;
}

export const TRANSLATIONS: Record<LanguageCode, TranslationBundle> = {
  en: {
    appBrand: 'Sapthagiri NPS University',
    navDashboard: 'Dashboard',
    navSubmitFeedback: 'Submit Feedback',
    navHistory: 'Feedback History',
    navAnalytics: 'Feedback Analytics',
    navAiInsights: 'AI Insights',
    navCourses: 'Courses & Subjects',
    navTeachers: 'Teacher Management',
    navStudents: 'Student Management',
    navReports: 'Reports & Export',
    navSettings: 'Profile & Settings',
    navHelp: 'Help & Support',
    signOut: 'Sign Out',
    submitFeedbackTitle: 'Course & Instructor Evaluation',
    submitFeedbackSubtitle: 'Evaluate teaching effectiveness, laboratory readiness, and learning resources.',
    selectCampaign: 'Feedback Campaign',
    selectDepartment: 'Department',
    selectYear: 'Academic Year',
    selectSemester: 'Semester',
    selectCourse: 'Course / Program',
    selectSubject: 'Subject',
    assignedInstructor: 'Assigned Instructor',
    anonymousLabel: 'Submit Anonymously',
    anonymousHint: 'Your identity will be stripped from all faculty views, dashboards, and exported reports.',
    writtenCommentsLabel: 'Descriptive Comments & Suggestions',
    writtenCommentsPlaceholder: 'Share specific strengths, laboratory feedback, or constructive teaching suggestions...',
    saveDraft: 'Save Draft',
    submitEvaluation: 'Submit Feedback',
    updateEvaluation: 'Update Submission',
    completionProgress: 'Form Completion Progress',
    dimensions: {
      teaching_quality: 'Teaching Quality & Clarity',
      communication: 'Communication Effectiveness',
      punctuality: 'Punctuality & Pacing',
      subject_knowledge: 'Subject Knowledge Depth',
      methodology: 'Teaching Methodology',
      classroom_environment: 'Classroom Environment',
      infrastructure: 'Lab & Campus Infrastructure',
      overall_satisfaction: 'Overall Satisfaction',
    },
    helpTitle: 'Help, Deadlines & AI Feedback Assistant',
    askAssistantPlaceholder: 'Ask about deadlines, anonymity protection, drafts, or QR access...',
    sendMessage: 'Ask Assistant',
  },
  hi: {
    appBrand: 'सप्तगिरि एनपीएस विश्वविद्यालय',
    navDashboard: 'डैशबोर्ड',
    navSubmitFeedback: 'फ़ीडबैक जमा करें',
    navHistory: 'फ़ीडबैक इतिहास',
    navAnalytics: 'फ़ीडबैक विश्लेषण',
    navAiInsights: 'AI अंतर्दृष्टि',
    navCourses: 'पाठ्यक्रम और विषय',
    navTeachers: 'शिक्षक प्रबंधन',
    navStudents: 'छात्र प्रबंधन',
    navReports: 'रिपोर्ट और निर्यात',
    navSettings: 'प्रोफ़ाइल और सेटिंग्स',
    navHelp: 'सहायता और समर्थन',
    signOut: 'लॉग आउट',
    submitFeedbackTitle: 'पाठ्यक्रम और शिक्षक मूल्यांकन',
    submitFeedbackSubtitle: 'शिक्षण गुणवत्ता, प्रयोगशाला सुविधाओं और सीखने के संसाधनों का मूल्यांकन करें।',
    selectCampaign: 'फ़ीडबैक अभियान',
    selectDepartment: 'विभाग',
    selectYear: 'शैक्षणिक वर्ष',
    selectSemester: 'सेमेस्टर',
    selectCourse: 'कोर्स / कार्यक्रम',
    selectSubject: 'विषय',
    assignedInstructor: 'नियुक्त शिक्षक',
    anonymousLabel: 'गुमनाम रूप से जमा करें',
    anonymousHint: 'सभी संकाय डैशबोर्ड और रिपोर्ट से आपकी पहचान पूरी तरह हटा दी जाएगी।',
    writtenCommentsLabel: 'विस्तृत टिप्पणी और सुझाव',
    writtenCommentsPlaceholder: 'शिक्षण शैली, प्रयोगशाला उपकरण या सुधार के लिए अपने सुझाव लिखें...',
    saveDraft: 'ड्राफ्ट सहेजें',
    submitEvaluation: 'फ़ीडबैक जमा करें',
    updateEvaluation: 'प्रविष्टि अपडेट करें',
    completionProgress: 'फॉर्म पूर्णता प्रगति',
    dimensions: {
      teaching_quality: 'शिक्षण गुणवत्ता और स्पष्टता',
      communication: 'संवाद कौशल',
      punctuality: 'समयनिष्ठा',
      subject_knowledge: 'विषय ज्ञान की गहराई',
      methodology: 'शिक्षण पद्धति',
      classroom_environment: 'कक्षा का वातावरण',
      infrastructure: 'प्रयोगशाला और बुनियादी ढांचा',
      overall_satisfaction: 'समग्र संतुष्टि',
    },
    helpTitle: 'सहायता, समय-सीमा और AI सहायक',
    askAssistantPlaceholder: 'समय-सीमा, गोपनीयता, ड्राफ्ट या QR कोड के बारे में पूछें...',
    sendMessage: 'सहायक से पूछें',
  },
  kn: {
    appBrand: 'ಸಪ್ತಗಿರಿ ಎನ್‌ಪಿಎಸ್ ವಿಶ್ವವಿದ್ಯಾಲಯ',
    navDashboard: 'ಡ್ಯಾಶ್‌ಬೋರ್ಡ್',
    navSubmitFeedback: 'ಪ್ರತಿಕ್ರಿಯೆ ಸಲ್ಲಿಸಿ',
    navHistory: 'ಪ್ರತಿಕ್ರಿಯೆ ಇತಿಹಾಸ',
    navAnalytics: 'ವಿಶ್ಲೇಷಣೆ',
    navAiInsights: 'AI ಒಳನೋಟಗಳು',
    navCourses: 'ಕೋರ್ಸ್ ಮತ್ತು ವಿಷಯಗಳು',
    navTeachers: 'ಅಧ್ಯಾಪಕರ ನಿರ್ವಹಣೆ',
    navStudents: 'ವಿದ್ಯಾರ್ಥಿ ನಿರ್ವಹಣೆ',
    navReports: 'ವರದಿ ಮತ್ತು ರಫ್ತು',
    navSettings: 'ಪ್ರೊಫೈಲ್ ಮತ್ತು ಸೆಟ್ಟಿಂಗ್ಸ್',
    navHelp: 'ಸಹಾಯ ಮತ್ತು ಬೆಂಬಲ',
    signOut: 'ಲಾಗ್ ಔಟ್',
    submitFeedbackTitle: 'ಕೋರ್ಸ್ ಮತ್ತು ಬೋಧಕರ ಮೌಲ್ಯಮಾಪನ',
    submitFeedbackSubtitle: 'ಬೋಧನಾ ಗುಣಮಟ್ಟ, ಪ್ರಯೋಗಾಲಯ ಸಿದ್ಧತೆ ಮತ್ತು ಕಲಿಕಾ ಸಂಪನ್ಮೂಲಗಳನ್ನು ಮೌಲ್ಯಮಾಪನ ಮಾಡಿ.',
    selectCampaign: 'ಪ್ರತಿಕ್ರಿಯೆ ಅಭಿಯಾನ',
    selectDepartment: 'ವಿಭಾಗ',
    selectYear: 'ಶೈಕ್ಷಣಿಕ ವರ್ಷ',
    selectSemester: 'ಸೆಮಿಸ್ಟರ್',
    selectCourse: 'ಕೋರ್ಸ್ / ಕಾರ್ಯಕ್ರಮ',
    selectSubject: 'ವಿಷಯ',
    assignedInstructor: 'ನಿಯೋಜಿತ ಬೋಧಕರು',
    anonymousLabel: 'ಅನಾಮಧೇಯವಾಗಿ ಸಲ್ಲಿಸಿ',
    anonymousHint: 'ಎಲ್ಲಾ ಅಧ್ಯಾಪಕರ ಡ್ಯಾಶ್‌ಬೋರ್ಡ್ ಮತ್ತು ವರದಿಗಳಿಂದ ನಿಮ್ಮ ಗುರುತನ್ನು ಮರೆಮಾಡಲಾಗುತ್ತದೆ.',
    writtenCommentsLabel: 'ವಿವರಣಾತ್ಮಕ ಅಭಿಪ್ರಾಯ ಮತ್ತು ಸಲಹೆಗಳು',
    writtenCommentsPlaceholder: 'ಬೋಧನಾ ವಿಧಾನ, ಪ್ರಯೋಗಾಲಯ ಸೌಲಭ್ಯಗಳು ಅಥವಾ ಸುಧಾರಣೆಗಳ ಬಗ್ಗೆ ಬರೆಯಿರಿ...',
    saveDraft: 'ಡ್ರಾಫ್ಟ್ ಉಳಿಸಿ',
    submitEvaluation: 'ಪ್ರತಿಕ್ರಿಯೆ ಸಲ್ಲಿಸಿ',
    updateEvaluation: 'ಸಲ್ಲಿಕೆ ನವೀಕರಿಸಿ',
    completionProgress: 'ಫಾರ್ಮ್ ಪೂರ್ಣಗೊಳಿಸುವಿಕೆ ಪ್ರಗತಿ',
    dimensions: {
      teaching_quality: 'ಬೋಧನಾ ಗುಣಮಟ್ಟ ಮತ್ತು ಸ್ಪಷ್ಟತೆ',
      communication: 'ಸಂವಹನ ಕೌಶಲ್ಯ',
      punctuality: 'ಸಮಯಪಾಲನೆ',
      subject_knowledge: 'ವಿಷಯ ಜ್ಞಾನದ ಆಳ',
      methodology: 'ಬೋಧನಾ ವಿಧಾನ',
      classroom_environment: 'ತರಗತಿಯ ವಾತಾವರಣ',
      infrastructure: 'ಪ್ರಯೋಗಾಲಯ ಮತ್ತು ಮೂಲಸೌಕರ್ಯ',
      overall_satisfaction: 'ಒಟ್ಟಾರೆ ತೃಪ್ತಿ',
    },
    helpTitle: 'ಸಹಾಯ, ಅಂತಿಮ ದಿನಾಂಕ ಮತ್ತು AI ಸಹಾಯಕ',
    askAssistantPlaceholder: 'ಅಂತಿಮ ದಿನಾಂಕ, ಅನಾಮಧೇಯತೆ, ಡ್ರಾಫ್ಟ್ ಅಥವಾ QR ಕೋಡ್ ಬಗ್ಗೆ ಕೇಳಿ...',
    sendMessage: 'ಸಹಾಯಕರನ್ನು ಕೇಳಿ',
  },
  te: {
    appBrand: 'సప్తగిరి ఎన్పిఎస్ యూనివర్సిటీ',
    navDashboard: 'డాష్‌బోర్డ్',
    navSubmitFeedback: 'అభిప్రాయం సమర్పించండి',
    navHistory: 'అభిప్రాయ చరిత్ర',
    navAnalytics: 'విశ్లేషణలు',
    navAiInsights: 'AI అంతర్దృష్టులు',
    navCourses: 'కోర్సులు మరియు సబ్జెక్టులు',
    navTeachers: 'అధ్యాపకుల నిర్వహణ',
    navStudents: 'విద్యార్థుల నిర్వహణ',
    navReports: 'నివేదికలు & ఎగుమతి',
    navSettings: 'ప్రొఫైల్ & సెట్టింగ్స్',
    navHelp: 'సహాయం & మద్దతు',
    signOut: 'సైన్ అవుట్',
    submitFeedbackTitle: 'కోర్సు మరియు అధ్యాపకుల మూల్యాంకనం',
    submitFeedbackSubtitle: 'బోధనా నాణ్యత, ప్రయోగశాల సౌకర్యాలు మరియు అభ్యాస వనరులను అంచనా వేయండి.',
    selectCampaign: 'ఫీడ్‌బ్యాక్ ప్రచారం',
    selectDepartment: 'విభాగం',
    selectYear: 'విద్యా సంవత్సరం',
    selectSemester: 'సెమిస్టర్',
    selectCourse: 'కోర్సు / ప్రోగ్రామ్',
    selectSubject: 'సబ్జెక్ట్',
    assignedInstructor: 'నియమించబడిన అధ్యాపకుడు',
    anonymousLabel: 'అజ్ఞాతంగా సమర్పించండి',
    anonymousHint: 'అన్ని ఫ్యాకల్టీ డాష్‌బోర్డ్‌లు మరియు నివేదికల నుండి మీ గుర్తింపు తొలగించబడుతుంది.',
    writtenCommentsLabel: 'వివరణాత్మక వ్యాఖ్యలు మరియు సూచనలు',
    writtenCommentsPlaceholder: 'బోధనా శైలి, ల్యాబ్ సౌకర్యాలు లేదా మెరుగుదల కోసం సూచనలు వ్రాయండి...',
    saveDraft: 'డ్రాఫ్ట్ సేవ్ చేయండి',
    submitEvaluation: 'అభిప్రాయం సమర్పించండి',
    updateEvaluation: 'నమోదును నవీకరించండి',
    completionProgress: 'ఫారమ్ పూర్తి పురోగతి',
    dimensions: {
      teaching_quality: 'బోధనా నాణ్యత మరియు స్పష్టత',
      communication: 'కమ్యూనికేషన్ సామర్థ్యం',
      punctuality: 'సమయపాలన',
      subject_knowledge: 'విషయ పరిజ్ఞానం లోతు',
      methodology: 'బోధనా పద్ధతి',
      classroom_environment: 'తరగతి గది వాతావరణం',
      infrastructure: 'ల్యాబ్ & క్యాంపస్ మౌలిక సదుపాయాలు',
      overall_satisfaction: 'మొత్తం సంతృప్తి',
    },
    helpTitle: 'సహాయం, గడువు తేదీలు & AI అసిస్టెంట్',
    askAssistantPlaceholder: 'గడువు తేదీలు, గోప్యత, డ్రాఫ్ట్‌లు లేదా QR యాక్సెస్ గురించి అడగండి...',
    sendMessage: 'సహాయకుడిని అడగండి',
  },
};
