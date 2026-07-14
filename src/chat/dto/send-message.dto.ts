import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class SendMessageDto {
  @ApiProperty({ example: 'Hi — loved your pitch, keen to learn more.' })
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  body: string;
}
