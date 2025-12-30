import JSZip from 'jszip';
import PDFDocument from 'pdfkit';

interface ValidationCheck {
  type: string;
  description: string;
  valid: boolean;
  error?: string;
  warnings?: string[];
}
interface ValidationResult {
  filename: string;
  filesize: number;
  valid: boolean;
  errors: number;
  warnings: number;
  results: ValidationCheck[];
  sub_results?: ValidationResult[];
}
declare class Validator {
  private _errors;
  private _warnings;
  private _checks;
  private _sub_checks;
  private _blocked;
  constructor();
  add_check(type: string, description: string, checkFn: () => Promise<void>): Promise<void>;
  err(message: string, blocker?: boolean): void;
  warn(message: string): void;
  get errors(): number;
  get warnings(): number;
  static validate_file(filePath: string): Promise<ValidationResult>;
  static validate_content(
    content: Buffer | Uint8Array,
    filename: string,
    filesize: number
  ): Promise<ValidationResult>;
  static validate_obf_content_static(
    content: string,
    filename: string,
    filesize: number,
    opts?: {
      zipper?: JSZip;
    }
  ): Promise<ValidationResult>;
  static validate_obf_file(
    filePath: string,
    opts?: {
      zipper?: JSZip;
    }
  ): Promise<ValidationResult>;
  static validate_obz_content_static(
    content: Buffer | Uint8Array,
    filename: string,
    filesize: number
  ): Promise<ValidationResult>;
  static validate_obz_file(filePath: string): Promise<ValidationResult>;
  validate_obz_content_buffer(
    zipContent: Buffer | Uint8Array,
    filename: string
  ): Promise<[ValidationCheck[], ValidationResult[]]>;
  validate_obf_content(
    content: string,
    filename: string,
    opts?: {
      zipper?: JSZip;
    }
  ): Promise<ValidationCheck[]>;
}

interface OBFImage {
  id: string;
  data?: string;
  url?: string;
  content_type?: string;
  width?: number;
  height?: number;
  ext_grid3_entry?: string;
  ext_snap_identifier?: string;
  [key: string]: any;
}
interface OBFSound {
  id: string;
  data?: string;
  url?: string;
  content_type?: string;
  [key: string]: any;
}
interface OBFButton {
  id: string;
  label?: string;
  vocalization?: string;
  image_id?: string;
  sound_id?: string;
  hidden?: boolean;
  action?: string;
  actions?: string[];
  background_color?: string;
  border_color?: string;
  load_board?: {
    id?: string;
    path?: string;
    url?: string;
  };
  style?: {
    background_color?: string;
    border_color?: string;
    font_color?: string;
    [key: string]: any;
  };
  [key: string]: any;
}
interface OBFPage {
  id: string;
  name?: string;
  locale?: string;
  format: string;
  grid?: {
    rows: number;
    columns: number;
    order: (string | null)[][];
  };
  buttons: OBFButton[];
  images: OBFImage[];
  sounds: OBFSound[];
  style?: {
    background_color?: string;
    [key: string]: any;
  };
  [key: string]: any;
}
interface OBZPackage {
  format: string;
  boards: OBFPage[];
  images: OBFImage[];
  sounds: OBFSound[];
  [key: string]: any;
}

interface PdfOptions {
  headerless?: boolean;
  text_on_top?: boolean;
  pageNum?: number;
  totalPages?: number;
}
declare class PdfBuilder {
  static build(obj: any, destPath: string, opts?: PdfOptions): Promise<string>;
  static buildPage(doc: typeof PDFDocument, board: OBFPage, opts: PdfOptions): Promise<void>;
}

declare const Utils: {
  get_url(url: string | null | undefined): Promise<{
    content_type: string;
    data: Buffer | ArrayBuffer;
    extension: string;
  } | null>;
  identify_content(content: Buffer | Uint8Array | string, filename: string): Promise<string>;
  identify_file(filePath: string): Promise<string>;
  fix_color(str: string, type?: 'hex' | 'string'): string;
  load_obf_content(content: Buffer | Uint8Array, filename: string): Promise<OBFPage>;
  load_obf(filePath: string): Promise<OBFPage>;
  parse_obf(obj: any, _opts?: {}): OBFPage;
};

interface PathHash {
  zip?: JSZip;
  boards?: Record<
    string,
    {
      path: string;
    }
  >;
  images?: Record<
    string,
    {
      path: string;
      content_type?: string;
      width?: number;
      height?: number;
    }
  >;
  sounds?: Record<
    string,
    {
      path: string;
    }
  >;
  included_boards?: Record<string, OBFPage>;
}
interface ToIncludeOptions {
  images?: boolean;
  sounds?: boolean;
  image_urls?: boolean;
  sound_urls?: boolean;
}
declare const External: {
  trim_empties(hash: Record<string, any>): Record<string, any>;
  parse_license(pre_license: any): Record<string, any>;
  fix_color(str: string, targetFormat?: 'hex' | 'rgb'): string;
  to_obf(
    hash: any,
    destPath?: string | null,
    pathHash?: PathHash | null,
    toInclude?: ToIncludeOptions
  ): Promise<string | null>;
  to_obz(
    content: any,
    destPath: string,
    opts?: {
      to_include?: ToIncludeOptions;
    }
  ): Promise<string>;
  from_obf(
    obfJsonOrPath: string | OBFPage,
    opts?: {
      zipper?: JSZip;
      manifest?: any;
    }
  ): Promise<OBFPage>;
  from_obz(obzPath: string): Promise<{
    boards: OBFPage[];
    images: OBFImage[];
    sounds: OBFSound[];
  }>;
};

declare const Sfy: {
  to_external(filePath: string): Promise<{
    boards: OBFPage[];
    images: OBFImage[];
    sounds: any[];
  }>;
};

declare const Sgrid: {
  to_external(filePath: string): Promise<OBFPage>;
};

declare const TouchChat: {
  to_external(filePath: string): Promise<OBZPackage>;
  from_external(obf: any, outputPath: string): Promise<void>;
};

declare const Snap: {
  to_external(filePath: string): Promise<OBZPackage>;
  from_external(obf: any, outputPath: string): Promise<void>;
};

declare const Grid3: {
  to_external(filePath: string): Promise<OBZPackage>;
  from_external(obf: any, outputPath: string): Promise<void>;
};

declare const Picto4me: {
  to_external(zipPath: string): Promise<
    | {
        boards: OBFPage[];
        images: OBFImage[];
        sounds: OBFSound[];
      }
    | OBFPage
  >;
};

export {
  External,
  Grid3,
  type OBFButton,
  type OBFImage,
  type OBFPage,
  type OBFSound,
  type OBZPackage,
  PdfBuilder,
  Picto4me,
  Sfy,
  Sgrid,
  Snap,
  TouchChat,
  Utils,
  Validator,
};
