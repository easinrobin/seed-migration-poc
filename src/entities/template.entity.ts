export type Template = {
  id: number;
  industryId: number;
  industryName: string;
  name: string;
  status:
    | "draft"
    | "published"
    | "shared"
    | "assigned to product"
    | "pending approval"
    | "approved"
    | "active"
    | "rejected"
    | "pending removal";
  minFields: number;
  maxFields: number;
  minSectionLevels: number;
  maxSectionLevels: number;
  minSections: number;
  maxSections: number;
  createdAt: Date;
  updatedAt: Date;
};
