import { ApiProperty } from '@nestjs/swagger';
import { SwipeDirection } from '@prisma/client';
import { IsEnum, IsString } from 'class-validator';

export class SwipeDto {
  @ApiProperty({ description: 'The user being swiped on' })
  @IsString()
  targetId: string;

  @ApiProperty({ enum: SwipeDirection })
  @IsEnum(SwipeDirection)
  direction: SwipeDirection;
}
