import { jfApiClient } from '/@/renderer/api/jellyfin/jellyfin-api';
import { jfType } from '/@/shared/api/jellyfin/jellyfin-types';
import { ServerListItemWithCredential } from '/@/shared/types/domain-types';

type ApiClientProps = {
    server: null | ServerListItemWithCredential;
    serverId: string;
    signal?: AbortSignal;
};

const COLLECTION_SONG_TYPES: Record<string, string[]> = {
    [jfType._enum.collection.BOOKS]: ['AudioBook'],
    [jfType._enum.collection.MUSIC]: ['Audio'],
};

const DEFAULT_SONG_TYPES = COLLECTION_SONG_TYPES[jfType._enum.collection.MUSIC];

const libraryCache = new Map<string, Promise<{ collectionType: string; id: string }[]>>();

const getLibraries = (apiClientProps: ApiClientProps) => {
    const { serverId } = apiClientProps;
    let libraries = libraryCache.get(serverId);

    if (!libraries) {
        const userId = apiClientProps.server?.userId;

        if (!userId) {
            return Promise.resolve([]);
        }

        libraries = jfApiClient({ ...apiClientProps, signal: undefined })
            .getMusicFolderList({ params: { userId } })
            .then((res) => {
                if (res.status !== 200) {
                    throw new Error('Failed to get music folder list');
                }

                return res.body.Items.map((item) => ({
                    collectionType: item.CollectionType,
                    id: item.Id,
                }));
            });

        libraries.catch(() => libraryCache.delete(serverId));
        libraryCache.set(serverId, libraries);
    }

    return libraries;
};

/**
 * Resolves the song IncludeItemTypes filter valid for the given libraries. With
 * no musicFolderId, returns the union across all libraries so unscoped queries
 * (global search, all songs) still cover every supported collection type.
 */
export const getSongItemTypes = async (
    apiClientProps: ApiClientProps,
    musicFolderId?: string | string[],
): Promise<string> => {
    const libraries = await getLibraries(apiClientProps).catch(() => []);
    const ids = Array.isArray(musicFolderId)
        ? musicFolderId
        : musicFolderId
          ? [musicFolderId]
          : null;

    const scoped = ids ? libraries.filter((library) => ids.includes(library.id)) : libraries;

    const types = new Set<string>();
    for (const library of scoped) {
        for (const type of COLLECTION_SONG_TYPES[library.collectionType] || []) {
            types.add(type);
        }
    }

    if (types.size === 0) {
        return DEFAULT_SONG_TYPES.join(',');
    }

    return [...types].join(',');
};
