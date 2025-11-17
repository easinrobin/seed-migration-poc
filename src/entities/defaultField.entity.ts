export type DefaultField = {
  id: string;
  industryId: number;
  defaultSectionId: number;
  name: string;
  sequence: number;
  dataType: "text" | "integer" | "decimal" | "bool" | "set" | "date" | "file";
  inputType:
    | "text"
    | "number"
    | "dropdown"
    | "radio"
    | "checkbox"
    | "range"
    | "date"
    | "upload";

  inputOptions: Record<string, unknown>;
  inputRules: Record<string, unknown>;
  unit: string;
  unitSymbol: string;
  createdAt: Date;
  updatedAt: Date;
};
