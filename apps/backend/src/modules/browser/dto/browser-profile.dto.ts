import { IsString, MaxLength } from 'class-validator';

import { MAX_JAR_BYTES } from '../browser-profile.service';

export class PutBrowserProfileDto {
  /** Scramjet's cookie jar, as its `dump()` serialises it. Checked to be a JSON object. */
  @IsString()
  @MaxLength(MAX_JAR_BYTES)
  jar!: string;
}
