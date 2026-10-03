import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { GameRegistry } from '@cardroom/game-core';
import {
  ErrorCode,
  updateProfileSchema,
  type GameCatalogEntry,
  type MatchHistoryEntry,
  type MeResponse,
  type PlayerProfile,
  type PlayerSummary,
  type PresenceSnapshot,
  type ProfileDto,
  type PublicRoomSummary,
} from '@cardroom/shared';
import { CurrentIdentity, HttpAuthGuard } from '../auth/http-auth.guard';
import type { AuthIdentity } from '../auth/token-verifier';
import { GAME_REGISTRY } from '../games/tokens';
import type { ProfileRecord } from '../persistence/models';
import { MatchesRepository, ProfilesRepository, type MatchHistoryRow } from '../persistence/repositories';
import { PresenceService } from '../presence/presence.service';
import { RoomsService } from '../rooms/rooms.service';

const HISTORY_LIMIT = 30;
const SEARCH_LIMIT = 20;
const SEARCH_PATTERN = /^[A-Za-z0-9_]{0,20}$/;

const toProfileDto = (profile: ProfileRecord): ProfileDto => ({
  id: profile.id,
  username: profile.username,
  avatarUrl: profile.avatarUrl,
  guest: profile.guest,
  createdAt: profile.createdAt.toISOString(),
  stats: profile.stats,
  chips: profile.chips,
});

function toHistoryEntry(row: MatchHistoryRow, registry: GameRegistry): MatchHistoryEntry {
  return {
    ...row,
    gameName: registry.get(row.gameId)?.name ?? row.gameId,
    startedAt: row.startedAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
  };
}

@Controller('health')
export class HealthController {
  @Get()
  check(): { status: 'ok' } {
    return { status: 'ok' };
  }
}

@Controller('games')
export class GamesController {
  constructor(@Inject(GAME_REGISTRY) private readonly registry: GameRegistry) {}

  @Get()
  list(): GameCatalogEntry[] {
    return this.registry.list();
  }
}

@Controller('rooms')
@UseGuards(HttpAuthGuard)
export class RoomsController {
  constructor(private readonly rooms: RoomsService) {}

  @Get('public')
  listPublic(): Promise<PublicRoomSummary[]> {
    return this.rooms.listPublic();
  }
}

@Controller('me')
@UseGuards(HttpAuthGuard)
export class MeController {
  constructor(
    private readonly profiles: ProfilesRepository,
    private readonly matches: MatchesRepository,
    private readonly presence: PresenceService,
    @Inject(GAME_REGISTRY) private readonly registry: GameRegistry,
  ) {}

  @Get()
  async me(@CurrentIdentity() identity: AuthIdentity): Promise<MeResponse> {
    const profile = await this.profiles.find(identity.userId);
    return {
      userId: identity.userId,
      email: identity.email,
      guest: identity.guest,
      profile: profile ? toProfileDto(profile) : null,
    };
  }

  @Put('profile')
  async updateProfile(@CurrentIdentity() identity: AuthIdentity, @Body() body: unknown): Promise<ProfileDto> {
    const parsed = updateProfileSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({ code: ErrorCode.Validation, message: parsed.error.issues[0]?.message });
    }
    // Guests pick a temporary name; an account reserves its username (a guest who
    // created an account keeps their history and now claims a name for good).
    const input = { username: parsed.data.username, avatarUrl: parsed.data.avatarUrl ?? null };
    const profile = identity.guest
      ? await this.profiles.upsertGuest(identity.userId, input)
      : await this.profiles.upsert(identity.userId, input);
    if (!profile) {
      throw new ConflictException({ code: ErrorCode.UsernameTaken, message: 'That username is taken' });
    }
    await this.presence.updateInfo(profile);
    return toProfileDto(profile);
  }

  @Get('matches')
  async history(@CurrentIdentity() identity: AuthIdentity): Promise<MatchHistoryEntry[]> {
    const rows = await this.matches.historyFor(identity.userId, HISTORY_LIMIT);
    return rows.map((row) => toHistoryEntry(row, this.registry));
  }
}

/** Public player directory: search, profiles and stats (signed-in users only). */
@Controller('players')
@UseGuards(HttpAuthGuard)
export class PlayersController {
  constructor(
    private readonly profiles: ProfilesRepository,
    private readonly matches: MatchesRepository,
    private readonly presence: PresenceService,
    @Inject(GAME_REGISTRY) private readonly registry: GameRegistry,
  ) {}

  /** `?search=ana` → username prefix matches; no search → most active players. */
  @Get()
  async search(@Query('search') search?: string): Promise<PlayerSummary[]> {
    const query = (search ?? '').trim();
    if (!SEARCH_PATTERN.test(query)) return [];
    const found = query
      ? await this.profiles.search(query, SEARCH_LIMIT)
      : await this.profiles.mostActive(SEARCH_LIMIT);
    const online = await this.presence.onlineAmong(found.map((p) => p.id));
    return found.map((p) => ({
      id: p.id,
      username: p.username,
      avatarUrl: p.avatarUrl,
      stats: p.stats,
      chips: p.chips,
      online: online.has(p.id),
    }));
  }

  @Get(':username')
  async profile(@Param('username') username: string): Promise<PlayerProfile> {
    const profile = SEARCH_PATTERN.test(username) ? await this.profiles.findByUsername(username) : null;
    if (!profile) throw new NotFoundException({ code: 'PLAYER_NOT_FOUND', message: 'Player not found' });
    const [presence, rows] = await Promise.all([
      this.presence.presenceOf(profile.id),
      this.matches.historyFor(profile.id, HISTORY_LIMIT),
    ]);
    return {
      id: profile.id,
      username: profile.username,
      avatarUrl: profile.avatarUrl,
      createdAt: profile.createdAt.toISOString(),
      stats: profile.stats,
      chips: profile.chips,
      online: presence !== null,
      presence,
      recentMatches: rows.map((row) => toHistoryEntry(row, this.registry)),
    };
  }
}

@Controller('presence')
export class PresenceController {
  constructor(private readonly presence: PresenceService) {}

  /** Who is online and where (signed-in users only). */
  @Get()
  @UseGuards(HttpAuthGuard)
  snapshot(): Promise<PresenceSnapshot> {
    return this.presence.snapshot();
  }

  /** Public: just the number, for the landing page. */
  @Get('count')
  async count(): Promise<{ count: number }> {
    return { count: await this.presence.count() };
  }
}
