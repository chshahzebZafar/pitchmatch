import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';

export class PushTokenDto {
  @ApiProperty({ description: 'FCM registration token for this device' })
  @IsString()
  @MinLength(10)
  @MaxLength(255)
  token!: string;

  @ApiProperty({ enum: ['android', 'ios'] })
  @IsIn(['android', 'ios'])
  platform!: 'android' | 'ios';
}
