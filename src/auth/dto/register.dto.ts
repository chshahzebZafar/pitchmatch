import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Role } from '@prisma/client';

export class RegisterDto {
  @ApiProperty({ example: 'Jane Founder' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string;

  @ApiProperty({ example: 'jane@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: '+923001234567', description: 'E.164 format' })
  @Matches(/^\+?[1-9]\d{6,14}$/, { message: 'phone must be in E.164 format' })
  phone: string;

  @ApiProperty({ example: 'S3curePass!', minLength: 8 })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password: string;

  @ApiProperty({
    enum: [Role.INVESTOR, Role.INNOVATOR, Role.MEDIATOR],
    example: Role.INNOVATOR,
  })
  @IsEnum(Role)
  role: Role;
}
