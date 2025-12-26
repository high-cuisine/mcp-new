export interface ClinicRulesJson {
    schedule: Array<{
        date: string;
        reception: string[];
        procedures: string[];
        liveQueue: boolean;
        dentistryDay: boolean;
        surgeryDay: boolean;
        cardiologyDay: boolean;
        transfers: string[];
    }>;
    doctors: Array<{
        name: string;
        roles: string[];
        notes: string;
        duration: {
            primary: number | null;
            repeat: number | null;
            echo: number | null;
        };
    }>;
    restrictions: string[];
    servicesMissing: string[];
    routing: Array<{
        keywords: string[];
        doctor: string;
    }>;
    bookingRules: {
        general: string[];
        byDoctor: Array<{
            name: string;
            rules: string[];
            duration: { primary: number | null; repeat: number | null };
        }>;
        surgery: {
            surgeon: string;
            rules: string[];
            heavyLimits: string[];
            slots: string[];
            maxPerDay: number | null;
        };
        dentistry: {
            day: string;
            rules: string[];
            slots: string[];
            maxPerDay: number | null;
        };
        cardiology: {
            doctor: string;
            days: string[];
            rules: string[];
            duration: { primary: number | null; repeat: number | null; echo: number | null };
        };
        procedures: {
            staff: string[];
            rules: string[];
            items: Array<{ procedure: string; duration: number | null }>;
        };
        vaccination: { rules: string[]; primary: string[]; nonPrimary: string[] };
        uzi: { who: string[]; prep: string[]; notes: string[] };
        lab: { inHouse: string[]; timing: string[]; externalOrders: string[] };
        pharmacy: { rules: string[] };
        stationary: { rules: string[]; onlyOwnPatients: boolean };
    };
    equipment: { xray: boolean; orthoped: boolean; stationaryOnlyOwn: boolean };
    notes: string;
}
